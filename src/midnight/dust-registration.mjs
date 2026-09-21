import assert from 'node:assert/strict';

export async function registerDust({ context, availableCoins, dustBalance, load, save, waitForDust, log = console.log }) {
  const coins = availableCoins.filter(coin => !coin.meta.registeredForDustGeneration);
  if (!coins.length && dustBalance > 0n) return;
  const prior = await load('dust-registration');
  // Receiving additional NIGHT does not invalidate an already usable fee wallet.
  if (dustBalance > 0n && (!prior || ['ready', 'confirmed'].includes(prior.status))) return;
  assert(!prior, 'Prior DUST registration requires reconciliation; retain journal');
  assert(coins.length, 'No unregistered NIGHT coins available; check pending transactions');
  const journal = { status: 'preparing', startedAt: new Date().toISOString() };
  const persist = () => save('dust-registration', journal);
  await persist();
  log('DUST registration: preparing');
  const recipe = await context.wallet.registerNightUtxosForDustGeneration(coins,
    context.unshieldedKeystore.getPublicKey(), payload => context.unshieldedKeystore.signData(payload));
  journal.status = 'proving';
  await persist();
  log('DUST registration: proving');
  const tx = await context.wallet.finalizeRecipe(recipe);
  journal.transaction = tx.serialize();
  journal.identifiers = tx.identifiers();
  journal.status = 'submitting';
  await persist();
  log('DUST registration: submitting ' + journal.identifiers.at(-1));
  journal.txId = await context.wallet.submitTransaction(tx);
  journal.status = 'confirmed';
  await persist();
  log('DUST registration: confirmed; waiting for fee balance');
  await waitForDust();
  journal.status = 'ready';
  await persist();
}

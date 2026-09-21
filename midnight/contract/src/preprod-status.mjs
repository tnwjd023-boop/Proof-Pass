import { loadPrivate, config } from './live-runtime.mjs';
import assert from 'node:assert/strict';
assert.equal(config.networkId, 'preprod');
const snapshot = await loadPrivate('wallet-snapshot');
if (!snapshot) console.log(JSON.stringify({ status: 'snapshot-not-yet-written' }));
else {
  const shielded = JSON.parse(snapshot.shielded), dust = JSON.parse(snapshot.dust), unshielded = JSON.parse(snapshot.unshielded);
  const registration = await loadPrivate('dust-registration');
  console.log(JSON.stringify({ savedAt: snapshot.savedAt, network: snapshot.network,
    shieldedOffset: shielded.offset, dustOffset: dust.offset, unshieldedOffset: unshielded.appliedId,
    availableUnshieldedValue: (unshielded.state?.availableUtxos ?? []).reduce((total, coin) => total + BigInt(coin.utxo.value), 0n).toString(),
    availableCoins: unshielded.state?.availableUtxos?.length ?? 0,
    pendingCoins: unshielded.state?.pendingUtxos?.length ?? 0,
    deploymentStarted: !!await loadPrivate('deployment-started'), deploymentSaved: !!await loadPrivate('deployment'),
    dustRegistration: registration ? { status: registration.status, startedAt: registration.startedAt, txId: registration.txId ?? null } : null,
    registeredCoins: (unshielded.state?.availableUtxos ?? []).filter(coin => coin.meta.registeredForDustGeneration).length }));
}

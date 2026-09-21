import assert from 'node:assert/strict';
import { Client } from 'xrpl';
import codec from 'ripple-address-codec';
import { hexBytes } from '../protocol.mjs';
export async function readMasterState(account) {
  const classic = codec.encodeAccountID(hexBytes(account, 20));
  const client = new Client('wss://s.altnet.rippletest.net:51233', { connectionTimeout: 15000, timeout: 15000 });
  try {
    await client.connect();
    const { result: { info } } = await client.request({ command: 'server_info' });
    assert.equal(info.network_id, 1);
    assert.ok(Number.isFinite(info.validated_ledger?.age) && info.validated_ledger.age <= 30, 'XRPL ledger stale');
    const { result: ledger } = await client.request({ command: 'ledger', ledger_index: 'validated', transactions: false });
    assert.equal(ledger.validated, true);
    const { result: state } = await client.request({ command: 'account_info', account: classic, ledger_hash: ledger.ledger_hash });
    assert.equal(state.validated, true);
    assert.equal(state.ledger_hash, ledger.ledger_hash);
    assert.equal(state.account_data.Account, classic);
    return { account, flags: state.account_data.Flags, networkId: 1, ledgerIndex: Number(ledger.ledger_index),
      ledgerHash: ledger.ledger_hash.toLowerCase(), closeTime: ledger.ledger.close_time + 946684800,
      observedAt: Math.floor(Date.now() / 1000) };
  } finally { await client.disconnect(); }
}

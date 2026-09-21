// Read-only public RPC probe. No wallets, signing, faucet requests or payments.
import { mkdir, writeFile } from 'node:fs/promises';

const checks = [
  {
    name: 'xrpl-testnet-server-info',
    endpoint: 'https://s.altnet.rippletest.net:51234/',
    body: { method: 'server_info', params: [{}] },
    accept: (result) => result?.status === 'success' && result.info?.network_id === 1
      && Number.isFinite(result.info.validated_ledger?.age)
      && result.info.validated_ledger.age <= 30,
    summarize: (result) => ({
      buildVersion: result.info.build_version,
      networkId: result.info.network_id,
      serverState: result.info.server_state,
      validatedLedger: result.info.validated_ledger,
    }),
  },
  {
    name: 'solana-devnet-genesis',
    endpoint: 'https://api.devnet.solana.com',
    body: { jsonrpc: '2.0', id: 1, method: 'getGenesisHash' },
    // solana-labs/solana sdk/src/genesis_config.rs: ClusterType::Devnet.
    accept: (result) => result === 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    summarize: (result) => ({ genesisHash: result }),
  },
  {
    name: 'solana-devnet-version',
    endpoint: 'https://api.devnet.solana.com',
    body: { jsonrpc: '2.0', id: 2, method: 'getVersion' },
    accept: (result) => typeof result?.['solana-core'] === 'string',
    summarize: (result) => result,
  },
];

const results = await Promise.all(checks.map(async (check) => {
  const started = Date.now();
  const observation = {
    name: check.name, endpoint: check.endpoint,
    method: check.body.method, observedAt: new Date(started).toISOString(),
  };
  try {
    const response = await fetch(check.endpoint, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(check.body), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.error || !check.accept(body.result)) {
      throw new Error(`RPC response rejected: ${JSON.stringify(body.error ?? body.result)}`);
    }
    return { ...observation, status: 'pass', durationMs: Date.now() - started,
      result: check.summarize(body.result) };
  } catch (error) {
    return { ...observation, status: 'failed', durationMs: Date.now() - started,
      error: error.message, cause: error.cause?.code ?? null };
  }
}));

const report = {
  schemaVersion: 1, kind: 'gate0-read-only-rpc-probe',
  gate0Complete: false, transactionsSubmitted: 0,
  runtime: process.version, results,
};
const directory = new URL('../../evidence/gate0/', import.meta.url);
await mkdir(directory, { recursive: true });
const filename = `rpc-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(new URL(filename, directory), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`Saved evidence/gate0/${filename}`);
if (results.some((result) => result.status !== 'pass')) process.exitCode = 1;

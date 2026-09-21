import assert from 'node:assert/strict';
export function networkProfile(name = 'undeployed') {
  assert(['undeployed', 'preprod'].includes(name), 'Unsupported Midnight network');
  const common = { networkId: name, proofServer: 'http://127.0.0.1:6300' };
  return Object.freeze(name === 'preprod' ? { ...common,
    node: 'https://rpc.preprod.midnight.network', indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
    indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
    genesisHash: '0xdf831b09a8baa92badf47762ce5ac439b7e47e3ed3d39600cfdd44fad552361b',
    privateDirectory: 'private/preprod-live', evidenceDirectory: 'evidence/preprod', intentDirectory: 'live-preprod', allowDevelopmentSeed: false,
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev/'
  } : { ...common, node: 'http://127.0.0.1:9944', indexer: 'http://127.0.0.1:8088/api/v4/graphql',
    indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws', genesisHash: null,
    privateDirectory: 'private/live', evidenceDirectory: 'evidence/gate1', intentDirectory: 'live', allowDevelopmentSeed: true });
}

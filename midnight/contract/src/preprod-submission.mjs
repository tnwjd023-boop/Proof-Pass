import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Effect, Duration } from 'effect';
import { NodeClient, PolkadotNodeClient } from '@midnight-ntwrk/wallet-sdk-node-client/effect';
import { SerializedTransaction } from '@midnight-ntwrk/wallet-sdk-abstractions';

export async function preprodSubmission(config, project) {
  const { freshSubmissionService } = await import(pathToFileURL(project + '/src/midnight/fresh-submission.mjs'));
  return freshSubmissionService(async () => {
    const nodeURL = new URL(config.node.replace(/^http/, 'ws'));
    // The installed SDK's initial disconnect followed by immediate reconnect
    // races on Preprod. Keep the initial connection for this submission only.
    const api = new ApiPromise({ provider: new WsProvider(nodeURL.toString()), throwOnConnect: true, noInitWarn: true });
    let timer;
    try {
      await Promise.race([api.isReadyOrError, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Preprod RPC initialization timeout')), 30000); })]);
      assert.equal(api.genesisHash.toHex(), config.genesisHash, 'Wrong submission network');
      const client = new PolkadotNodeClient({ nodeURL, reconnectionTimeout: Duration.seconds(20), reconnectionDelay: Duration.seconds(1) }, api);
      return {
        submit: (tx, status) => NodeClient.sendMidnightTransactionAndWait(SerializedTransaction.from(tx), status).pipe(
          Effect.provideService(NodeClient.NodeClient, client), Effect.timeout(Duration.seconds(120)), Effect.runPromise),
        close: () => api.disconnect()
      };
    } catch (error) { await api.disconnect(); throw error; }
    finally { clearTimeout(timer); }
  });
}

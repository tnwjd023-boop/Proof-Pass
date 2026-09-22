import { fileURLToPath } from 'node:url';
import { createDemoServer } from '../src/demo-server.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const server = await createDemoServer({ project, readOnly: true, network: 'preprod' });
server.listen(4175, '127.0.0.1', () => console.log('ProofPass saved evidence preview: http://127.0.0.1:4175'));

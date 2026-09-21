import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { encodePayment, paymentHash } from '../../src/protocol.mjs';
const fixture = JSON.parse(await readFile('test/fixtures/payment-v1.json', 'utf8'));
const rust = (await readFile('.local/gate1/rust-vector.hex', 'utf8')).trim();
assert.equal(encodePayment(fixture).toString('hex'), rust);
await mkdir('evidence/gate1', { recursive: true });
await writeFile('evidence/gate1/protocol-vector.json', JSON.stringify({ status: 'passed',
  mode: 'independent-node-rust-byte-encoding', bytes: rust.length / 2,
  requestHash: paymentHash(fixture), fixture: 'test/fixtures/payment-v1.json',
  compactHashCompatibility: 'not-claimed', checkedAt: new Date().toISOString() }, null, 2) + '\n');
console.log('Node/Rust canonical request bytes match.');

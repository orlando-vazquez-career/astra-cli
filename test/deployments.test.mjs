// test/deployments.test.mjs — registro de despliegues.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addDeployment, readDeployments, validateEntry } from '../lib/deployments.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'astra-dpl-'));
const SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

test('add valida cadena, red y direccion, y persiste con id y fecha', () => {
  const cwd = tmp();
  const e = addDeployment(cwd, { chain: 'stellar-testnet', kind: 'contract', label: 'hello', address: SAC }, { today: '2026-09-04' });
  assert.match(e.id, /^dpl_20260904_1$/);
  assert.equal(e.family, 'stellar');
  assert.equal(e.network, 'testnet');
  assert.equal(e.verified, false);
  assert.equal(readDeployments(cwd).deployments.length, 1);
  const e2 = addDeployment(cwd, { chain: 'base-sepolia', kind: 'token', label: 'usd', address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed', verified: true }, { today: '2026-09-04' });
  assert.equal(e2.id, 'dpl_20260904_2');
  assert.equal(e2.address, '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  assert.equal(readDeployments(cwd).deployments.length, 2);
});

test('rechaza direccion invalida para la familia, cadena desconocida, red incoherente y duplicados', () => {
  const cwd = tmp();
  assert.throws(() => addDeployment(cwd, { chain: 'base', kind: 'contract', label: 'x', address: SAC }), /direccion/);
  assert.throws(() => addDeployment(cwd, { chain: 'marte', kind: 'contract', label: 'x', address: SAC }), /cadena/);
  assert.throws(() => addDeployment(cwd, { chain: 'stellar-testnet', network: 'mainnet', kind: 'contract', label: 'x', address: SAC }), /red/);
  addDeployment(cwd, { chain: 'stellar-testnet', kind: 'contract', label: 'a', address: SAC });
  assert.throws(() => addDeployment(cwd, { chain: 'stellar-testnet', kind: 'contract', label: 'b', address: SAC }), /duplicad/);
  assert.equal(addDeployment(cwd, { chain: 'stellar-testnet', kind: 'contract', label: 'b', address: SAC }, { force: true }).label, 'b');
});

test('validateEntry normaliza EIP-55, exige tx con formato y rechaza secretos', () => {
  const v = validateEntry({ chain: 'base', kind: 'contract', label: 'x', address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed', tx: '0x' + 'ab'.repeat(32) });
  assert.equal(v.ok, true);
  assert.equal(v.normalized.address, '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  assert.equal(validateEntry({ chain: 'base', kind: 'contract', label: 'x', address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', tx: 'nope' }).ok, false);
  assert.equal(validateEntry({ chain: 'base', kind: 'nave', label: 'x', address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' }).ok, false);
  const s = validateEntry({ chain: 'base', kind: 'account', label: 'x', address: '0x' + 'cd'.repeat(32) });
  assert.equal(s.ok, false);
  assert.ok(s.errors.some(e => /secreta/.test(e)));
});

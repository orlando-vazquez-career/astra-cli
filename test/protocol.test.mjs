// test/protocol.test.mjs — resolucion del directorio del protocolo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProtocolDir, fetchProtocol } from '../lib/protocol.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'astra-proto-'));
const mk = dir => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'ASTRA-PROTOCOL.md'), '# ASTRA\n'); return dir; };

test('orden de resolucion: explicito > env > home > hermano del CLI > ./ASTRA', () => {
  const explicit = mk(path.join(tmp(), 'E'));
  const env = mk(path.join(tmp(), 'V'));
  const home = tmp();
  mk(path.join(home, '.astra', 'protocol'));
  assert.equal(resolveProtocolDir({ explicit, env: { ASTRA_PROTOCOL_DIR: env }, home }).dir, explicit);
  assert.equal(resolveProtocolDir({ env: { ASTRA_PROTOCOL_DIR: env }, home }).dir, env);
  assert.equal(resolveProtocolDir({ env: {}, home }).source, 'home');
  const cliRoot = path.join(tmp(), 'tools', 'astra-cli');
  const sibling = mk(path.join(cliRoot, '..', '..', 'protocols', 'ASTRA'));
  assert.equal(resolveProtocolDir({ env: {}, home: tmp(), cliRoot, cwd: tmp() }).dir, path.resolve(sibling));
  const cwd = tmp();
  mk(path.join(cwd, 'ASTRA'));
  assert.equal(resolveProtocolDir({ env: {}, home: tmp(), cliRoot: tmp(), cwd }).source, 'cwd');
  assert.equal(resolveProtocolDir({ env: {}, home: tmp(), cliRoot: tmp(), cwd: tmp() }), null);
});

test('fetchProtocol exige git y no toca la red en el test', () => {
  assert.throws(() => fetchProtocol({ dest: path.join(tmp(), 'p'), findExec: () => null }), /git/);
});

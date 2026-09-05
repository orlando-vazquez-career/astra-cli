// test/cli.test.mjs — el binario de punta a punta: version, ayuda, comando desconocido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/astra.mjs', import.meta.url));
export const astra = (args, opts = {}) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', ...opts });

test('astra --version imprime la version del package.json', () => {
  const r = astra(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout.trim(), /^astra 0\.1\.0$/);
});

test('astra sin argumentos imprime ayuda y sale 2; --help sale 0', () => {
  assert.equal(astra([]).status, 2);
  const r = astra(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /doctor/);
  assert.match(r.stdout, /mcp/);
});

test('un comando desconocido sale 2 con mensaje en stderr', () => {
  const r = astra(['nadaquever']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /desconocido/);
});

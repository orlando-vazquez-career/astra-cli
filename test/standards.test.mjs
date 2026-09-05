// test/standards.test.mjs — integridad del catalogo y busqueda.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStandards, searchStandards } from '../lib/standards.mjs';

test('el catalogo tiene ids unicos, urls https y familias validas', () => {
  const all = loadStandards();
  const ids = all.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(all.length >= 50, `solo ${all.length} entradas`);
  for (const s of all) {
    assert.match(s.url, /^https:\/\//, s.id);
    assert.ok(['stellar', 'evm', 'syscoin', 'base', 'payments', 'caip'].includes(s.family), s.id);
    assert.ok(Array.isArray(s.tags) && s.tags.length > 0, s.id);
    assert.ok(s.title && s.status && s.summary, s.id);
  }
});

test('busca por token, titulo y tags sin distinguir acentos', () => {
  assert.equal(searchStandards('token interface soroban')[0].id, 'SEP-0041');
  assert.equal(searchStandards('checksum direccion')[0].id, 'ERC-55');
  assert.equal(searchStandards('autenticación web')[0].id, 'SEP-0010');
  assert.equal(searchStandards('sep-0023')[0].id, 'SEP-0023');
  assert.ok(searchStandards('token', { family: 'evm' }).every(s => s.family === 'evm'));
  assert.ok(searchStandards('x402').some(s => s.id === 'X402'));
  assert.deepEqual(searchStandards('zzzz-nada'), []);
  assert.deepEqual(searchStandards(''), []);
});

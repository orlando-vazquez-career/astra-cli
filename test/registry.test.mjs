// test/registry.test.mjs — integridad del registro de cadenas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listChains, getChain, resolveFamily, FAMILIES } from '../lib/registry.mjs';

test('el registro tiene las cadenas de genesis con ids unicos y familias conocidas', () => {
  const ids = listChains().map(c => c.id);
  for (const id of ['stellar-mainnet', 'stellar-testnet', 'base', 'base-sepolia', 'syscoin-nevm', 'syscoin-tanenbaum', 'rollux', 'rollux-tanenbaum', 'syscoin-utxo']) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length);
  for (const c of listChains()) {
    assert.ok(FAMILIES.includes(c.family), c.id);
    assert.ok(['mainnet', 'testnet'].includes(c.network), c.id);
    for (const u of [...c.rpc, ...c.explorers, ...c.faucets, c.docs]) assert.match(u, /^https:\/\//, `${c.id} ${u}`);
    assert.match(c.verifiedAt, /^\d{4}-\d{2}-\d{2}$/, c.id);
    if (c.family === 'evm') { assert.equal(typeof c.chainId, 'number', c.id); assert.equal(c.caip2, `eip155:${c.chainId}`, c.id); }
    if (c.family === 'stellar') { assert.ok(c.passphrase, c.id); assert.ok(c.horizon, c.id); }
  }
});

test('getChain y resolveFamily', () => {
  assert.equal(getChain('base').chainId, 8453);
  assert.equal(getChain('nope'), null);
  assert.equal(resolveFamily('evm').family, 'evm');
  assert.equal(resolveFamily('syscoin-nevm').chain.chainId, 57);
  assert.equal(resolveFamily('marte'), null);
});

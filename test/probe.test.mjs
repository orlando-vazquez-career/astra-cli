// test/probe.test.mjs — sonda con fetch inyectado (sin red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { probeChain } from '../lib/probe.mjs';
import { getChain } from '../lib/registry.mjs';

const jsonResponse = body => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

test('EVM: chainId coincide y trae blockNumber', async () => {
  const fetchImpl = async (url, init) => {
    const req = JSON.parse(init.body);
    return jsonResponse({ jsonrpc: '2.0', id: req.id, result: req.method === 'eth_chainId' ? '0x2105' : '0x10' });
  };
  const r = await probeChain(getChain('base'), { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.chainId, 8453);
  assert.equal(r.blockNumber, 16);
});

test('EVM: chainId distinto al esperado marca ok=false con razon', async () => {
  const fetchImpl = async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x1' });
  const r = await probeChain(getChain('base'), { fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.reason, /chainId/);
});

test('EVM: si el primer RPC falla prueba el siguiente y deja warning', async () => {
  const fetchImpl = async (url, init) => {
    if (url.includes('rpc.tanenbaum.io')) throw new Error('ECONNRESET');
    const req = JSON.parse(init.body);
    return jsonResponse({ jsonrpc: '2.0', id: req.id, result: req.method === 'eth_chainId' ? '0x1644' : '0x2a' });
  };
  const r = await probeChain(getChain('syscoin-tanenbaum'), { fetchImpl });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.length >= 1);
  assert.match(r.endpoint, /publicnode/);
});

test('Stellar: valida passphrase por RPC y Horizon', async () => {
  const fetchImpl = async (url, init) => {
    if (!init || !init.body) return jsonResponse({ network_passphrase: 'Test SDF Network ; September 2015', history_latest_ledger: 4509039 });
    const req = JSON.parse(init.body);
    return jsonResponse({ jsonrpc: '2.0', id: req.id, result: req.method === 'getNetwork' ? { passphrase: 'Test SDF Network ; September 2015', protocolVersion: 28 } : { sequence: 4509039 } });
  };
  const r = await probeChain(getChain('stellar-testnet'), { fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.protocolVersion, 28);
  assert.equal(r.ledger, 4509039);
});

test('Stellar: passphrase ajena → ok=false', async () => {
  const fetchImpl = async () => jsonResponse({ network_passphrase: 'Otra red ; 2030', history_latest_ledger: 1 });
  const r = await probeChain(getChain('stellar-mainnet'), { fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.reason, /passphrase/);
});

test('UTXO sin syscoin-cli: ok=false con razon clara', async () => {
  const r = await probeChain(getChain('syscoin-utxo'), { findExec: () => null });
  assert.equal(r.ok, false);
  assert.match(r.reason, /syscoin-cli/);
});

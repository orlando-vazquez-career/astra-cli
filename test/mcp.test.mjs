// test/mcp.test.mjs — el servidor MCP de punta a punta por stdio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleMessage, MCP_TOOLS } from '../lib/mcp.mjs';

const BIN = fileURLToPath(new URL('../bin/astra.mjs', import.meta.url));

function rpcSession(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.on('error', reject);
    child.on('close', () => resolve(out.split('\n').filter(Boolean).map(l => JSON.parse(l))));
    for (const m of messages) child.stdin.write(JSON.stringify(m) + '\n');
    child.stdin.end();
  });
}

test('initialize, tools/list y tools/call responden por stdio; las notificaciones no', async () => {
  const res = await rpcSession([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'astra_chain_info', arguments: { id: 'base' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'astra_address_validate', arguments: { target: 'evm', address: '0x' + 'ab'.repeat(32) } } },
    { jsonrpc: '2.0', id: 5, method: 'nope' },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'astra_standards_search', arguments: { query: 'token interface soroban' } } },
  ]);
  const byId = Object.fromEntries(res.map(r => [r.id, r]));
  assert.equal(byId[1].result.protocolVersion, '2024-11-05');
  assert.equal(byId[1].result.serverInfo.name, 'astra');
  assert.ok(byId[2].result.tools.map(t => t.name).includes('astra_check'));
  assert.equal(byId[2].result.tools.length, MCP_TOOLS.length);
  assert.equal(JSON.parse(byId[3].result.content[0].text).chainId, 8453);
  const secret = JSON.parse(byId[4].result.content[0].text);
  assert.equal(secret.secret, true);
  assert.ok(!byId[4].result.content[0].text.includes('abab'));
  assert.equal(byId[5].error.code, -32601);
  assert.equal(JSON.parse(byId[6].result.content[0].text)[0].id, 'SEP-0041');
  assert.equal(res.length, 6, 'la notificacion no genera respuesta');
});

test('handleMessage: tool desconocida, cadena desconocida y JSON no-objeto', async () => {
  assert.equal((await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'x' } })).error.code, -32602);
  const r = await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'astra_chain_info', arguments: { id: 'marte' } } });
  assert.equal(r.result.isError, true);
  assert.equal((await handleMessage(null)).error.code, -32600);
  assert.equal(await handleMessage({ jsonrpc: '2.0', method: 'notifications/cancelled' }), null);
  assert.deepEqual((await handleMessage({ jsonrpc: '2.0', id: 3, method: 'ping' })).result, {});
});

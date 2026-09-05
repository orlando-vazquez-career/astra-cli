// probe.mjs — sonda en vivo de una cadena del registro. Es la UNICA parte del CLI que
// habla con la red, y solo cuando el usuario (o una tool MCP) lo pide explicitamente.
//
//   EVM:     eth_chainId + eth_blockNumber por JSON-RPC; el chainId tiene que coincidir
//            con el del registro (un RPC apuntando a otra red es el error mas caro).
//   Stellar: getNetwork + getLatestLedger por RPC (si la cadena tiene RPC) y la raiz de
//            Horizon; la passphrase tiene que coincidir con la del registro.
//   UTXO:    no hay RPC publico: se consulta `syscoin-cli getblockchaininfo` si existe.
//
// `fetchImpl` y `findExec` se inyectan para poder testear sin red.
import { spawnSync } from 'node:child_process';
import { findExecutable } from './util.mjs';

// `params` undefined → el campo se omite: el RPC de Stellar rechaza un `params: []`
// (espera objeto o nada), mientras que los nodos EVM exigen el array.
async function rpcCall(fetchImpl, url, method, params, timeoutMs, id = 1) {
  const payload = params === undefined ? { jsonrpc: '2.0', id, method } : { jsonrpc: '2.0', id, method, params };
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`);
  return body.result;
}

async function probeEvm(chain, endpoints, { fetchImpl, timeoutMs }) {
  const warnings = [];
  for (const url of endpoints) {
    try {
      const chainIdHex = await rpcCall(fetchImpl, url, 'eth_chainId', [], timeoutMs, 1);
      const blockHex = await rpcCall(fetchImpl, url, 'eth_blockNumber', [], timeoutMs, 2);
      const chainId = parseInt(chainIdHex, 16);
      const blockNumber = parseInt(blockHex, 16);
      const base = { endpoint: url, chainId, expectedChainId: chain.chainId, blockNumber, warnings };
      if (chain.chainId != null && chainId !== chain.chainId) {
        return { ...base, ok: false, reason: `chainId ${chainId} no coincide con el esperado ${chain.chainId} (${chain.id}): el RPC apunta a otra red` };
      }
      return { ...base, ok: true };
    } catch (err) {
      warnings.push(`${url}: ${err.message}`);
    }
  }
  return { ok: false, warnings, reason: endpoints.length ? 'ningun RPC respondio' : 'la cadena no tiene RPC publico en el registro: pasar --rpc <url>' };
}

async function probeStellar(chain, endpoints, { fetchImpl, timeoutMs }) {
  const warnings = [];
  const out = { warnings };
  for (const url of endpoints) {
    try {
      const net = await rpcCall(fetchImpl, url, 'getNetwork', undefined, timeoutMs, 1);
      const ledger = await rpcCall(fetchImpl, url, 'getLatestLedger', undefined, timeoutMs, 2);
      out.endpoint = url;
      out.passphrase = net.passphrase;
      out.protocolVersion = net.protocolVersion;
      out.ledger = ledger.sequence;
      break;
    } catch (err) {
      warnings.push(`${url}: ${err.message}`);
    }
  }
  if (chain.horizon) {
    try {
      const res = await fetchImpl(chain.horizon, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const root = await res.json();
      out.horizon = chain.horizon;
      out.passphrase = out.passphrase || root.network_passphrase;
      if (out.ledger == null) out.ledger = root.history_latest_ledger;
      if (root.network_passphrase && root.network_passphrase !== chain.passphrase) {
        return { ...out, ok: false, reason: `Horizon reporta la passphrase "${root.network_passphrase}", distinta a la del registro` };
      }
    } catch (err) {
      warnings.push(`${chain.horizon}: ${err.message}`);
    }
  }
  if (!out.passphrase) return { ...out, ok: false, reason: 'ni RPC ni Horizon respondieron' };
  if (out.passphrase !== chain.passphrase) return { ...out, ok: false, reason: `la passphrase "${out.passphrase}" no coincide con la del registro: el endpoint apunta a otra red` };
  return { ...out, ok: true };
}

function probeUtxo(chain, { findExec }) {
  const cli = findExec('syscoin-cli');
  if (!cli) return { ok: false, warnings: [], reason: 'requiere nodo local (syscoin-cli no encontrado en PATH)' };
  const r = spawnSync(cli, ['getblockchaininfo'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (r.status !== 0) return { ok: false, warnings: [], endpoint: cli, reason: `syscoin-cli fallo: ${(r.stderr || r.stdout || '').trim().split(/\r?\n/)[0] || 'sin salida'}` };
  try {
    const info = JSON.parse(r.stdout);
    return { ok: true, warnings: [], endpoint: cli, blockNumber: info.blocks, chainName: info.chain };
  } catch {
    return { ok: false, warnings: [], endpoint: cli, reason: 'syscoin-cli devolvio algo que no es JSON' };
  }
}

export async function probeChain(chain, { rpc, timeoutMs = 10000, fetchImpl = globalThis.fetch, findExec = findExecutable } = {}) {
  const started = performance.now();
  const endpoints = rpc ? [rpc] : (chain.rpc || []);
  let result;
  if (chain.family === 'evm') result = await probeEvm(chain, endpoints, { fetchImpl, timeoutMs });
  else if (chain.family === 'stellar') result = await probeStellar(chain, endpoints, { fetchImpl, timeoutMs });
  else if (chain.family === 'utxo') result = probeUtxo(chain, { findExec });
  else result = { ok: false, warnings: [], reason: `familia desconocida ${chain.family}` };
  return { id: chain.id, family: chain.family, network: chain.network, latencyMs: Math.round(performance.now() - started), ...result };
}

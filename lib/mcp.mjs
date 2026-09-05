// mcp.mjs — servidor MCP (Model Context Protocol) por stdio, JSON-RPC 2.0 delimitado por
// lineas, protocolVersion 2024-11-05. Cero dependencias.
//
// Expone las mismas funciones del CLI como tools para cualquier runtime con MCP (Claude
// Code, Codex, Cursor, Kimi Code, Gemini CLI, OpenCode...). Reglas:
//   - stdout es SOLO para respuestas JSON-RPC; todo log va a stderr.
//   - Las notificaciones (sin id) no se responden.
//   - Ninguna tool firma, despliega ni lee claves; astra_chain_probe es la unica que
//     toca la red y solo cuando se la llama.
import { doctor } from './doctor.mjs';
import { listChains, getChain } from './registry.mjs';
import { probeChain } from './probe.mjs';
import { validateAddress } from './address.mjs';
import { checkRepo } from './check.mjs';
import { readDeployments, addDeployment } from './deployments.mjs';
import { searchStandards } from './standards.mjs';

export const PROTOCOL_VERSION = '2024-11-05';

const str = { type: 'string' };
const cwdProp = { cwd: { type: 'string', description: 'Directorio del proyecto (default: el del proceso).' } };

export const MCP_TOOLS = [
  {
    name: 'astra_doctor',
    description: 'Detecta toolchains instalados (stellar, cargo, forge, cast, syscoin-cli...) y da un veredicto SAFE/CAUTION/AVOID por familia de cadena. Fase Orbita. Sin red.',
    inputSchema: { type: 'object', properties: { chain: { ...str, description: 'Id de cadena del registro para enfocar el veredicto (opcional).' }, ...cwdProp } },
    handler: async a => doctor({ chain: a.chain, cwd: a.cwd }),
  },
  {
    name: 'astra_chain_list',
    description: 'Lista las cadenas del registro (id, familia, red, chainId, RPC, explorers, faucets, docs). Sin red.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => listChains(),
  },
  {
    name: 'astra_chain_info',
    description: 'Perfil completo de una cadena del registro. Sin red.',
    inputSchema: { type: 'object', properties: { id: { ...str, description: 'Id de cadena, ej: base, stellar-testnet, syscoin-nevm, rollux.' } }, required: ['id'] },
    handler: async a => { const c = getChain(a.id); if (!c) return { isError: true, error: `cadena desconocida: ${a.id}` }; return c; },
  },
  {
    name: 'astra_chain_probe',
    description: 'Sonda EN VIVO de una cadena: valida chainId (EVM) o passphrase (Stellar) contra el registro y reporta bloque/ledger y latencia. Toca la red.',
    inputSchema: { type: 'object', properties: { id: { ...str, description: 'Id de cadena del registro.' }, rpc: { ...str, description: 'URL de RPC alternativa (opcional).' } }, required: ['id'] },
    handler: async a => { const c = getChain(a.id); if (!c) return { isError: true, error: `cadena desconocida: ${a.id}` }; const r = await probeChain(c, { rpc: a.rpc }); return r.ok ? r : { ...r, isError: true }; },
  },
  {
    name: 'astra_address_validate',
    description: 'Valida formato y checksum de una direccion (StrKey SEP-0023, EIP-55, bech32/base58 de Syscoin). Si el valor es una clave secreta lo dice y NO lo devuelve. Sin red.',
    inputSchema: { type: 'object', properties: { target: { ...str, description: "Id de cadena o familia: 'stellar', 'evm', 'utxo', 'base', 'stellar-testnet'..." }, address: str }, required: ['target', 'address'] },
    handler: async a => validateAddress(a.target, a.address),
  },
  {
    name: 'astra_check',
    description: 'Escaner de secretos, higiene del repo y (con gate=mainnet) checklist del Gate 2: carta aprobada, testnet registrada, auditoria apta, launch firmado. Sin red.',
    inputSchema: { type: 'object', properties: { ...cwdProp, gate: { ...str, enum: ['mainnet'], description: "Solo 'mainnet' (opcional)." } } },
    handler: async a => { const r = checkRepo(a.cwd || process.cwd(), { gate: a.gate }); return r.ok ? r : { ...r, isError: true }; },
  },
  {
    name: 'astra_deployments_list',
    description: 'Lee .astra/deployments.json: todo lo desplegado por el proyecto (cadena, red, direccion, tx, commit, verificado). Sin red.',
    inputSchema: { type: 'object', properties: { ...cwdProp } },
    handler: async a => readDeployments(a.cwd || process.cwd()),
  },
  {
    name: 'astra_deployments_add',
    description: 'Registra un despliegue en .astra/deployments.json (A4). Valida cadena, red, direccion y tx. No despliega nada: registra lo que el humano/CLI nativo ya desplego.',
    inputSchema: {
      type: 'object',
      properties: { ...cwdProp, chain: { ...str, description: 'Id de cadena del registro.' }, address: str, kind: { ...str, enum: ['contract', 'token', 'account', 'other'] }, label: str, tx: str, commit: str, wasmHash: str, verified: { type: 'boolean' }, verificationUrl: str, notes: str, force: { type: 'boolean' } },
      required: ['chain', 'address', 'label'],
    },
    handler: async a => addDeployment(a.cwd || process.cwd(), { chain: a.chain, address: a.address, kind: a.kind || 'contract', label: a.label, tx: a.tx, commit: a.commit, wasmHash: a.wasmHash, verified: a.verified === true, verificationUrl: a.verificationUrl, notes: a.notes }, { force: a.force === true }),
  },
  {
    name: 'astra_standards_search',
    description: 'Busca en el catalogo local de estandares (SEP, CAP, ERC, EIP, CAIP, x402, MPP, docs de Syscoin/Rollux/Base) por tema. Sin red.',
    inputSchema: { type: 'object', properties: { query: str, family: { ...str, enum: ['stellar', 'evm', 'syscoin', 'base', 'payments', 'caip'] }, limit: { type: 'integer' } }, required: ['query'] },
    handler: async a => searchStandards(a.query, { family: a.family, limit: a.limit || 10 }),
  },
];

function reply(id, result) { return { jsonrpc: '2.0', id, result }; }
function fail(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

export async function handleMessage(msg, { version = '0.0.0' } = {}) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return fail(null, -32600, 'request invalido');
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;
  if (typeof method !== 'string') return isNotification ? null : fail(id, -32600, 'falta method');
  if (method.startsWith('notifications/')) return null;
  if (method === 'initialize') {
    return reply(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'astra', version } });
  }
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') {
    return reply(id, { tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
  }
  if (method === 'tools/call') {
    const name = params && params.name;
    const tool = MCP_TOOLS.find(t => t.name === name);
    if (!tool) return fail(id, -32602, `tool desconocida: ${name}`);
    try {
      const result = await tool.handler((params && params.arguments) || {});
      const isError = !!(result && typeof result === 'object' && result.isError);
      const payload = result && typeof result === 'object' && !Array.isArray(result) ? (({ isError: _omit, ...rest }) => rest)(result) : result;
      return reply(id, { content: [{ type: 'text', text: JSON.stringify(payload, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) }], isError });
    } catch (err) {
      return reply(id, { content: [{ type: 'text', text: JSON.stringify({ error: err.message, code: err.code || 'ERROR' }) }], isError: true });
    }
  }
  if (isNotification) return null;
  return fail(id, -32601, `metodo no soportado: ${method}`);
}

export function startMcpServer({ input = process.stdin, output = process.stdout, version = '0.0.0', log = msg => process.stderr.write(msg + '\n') } = {}) {
  let buffer = '';
  let chain = Promise.resolve();
  const send = obj => output.write(JSON.stringify(obj) + '\n');
  const processLine = line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { send(fail(null, -32700, 'JSON invalido')); return; }
    chain = chain.then(async () => { const res = await handleMessage(msg, { version }); if (res) send(res); }).catch(err => log(`[astra mcp] ${err.stack || err}`));
  };
  input.setEncoding('utf8');
  input.on('data', chunk => {
    buffer += chunk;
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      processLine(line);
    }
  });
  input.on('end', () => { if (buffer.trim()) processLine(buffer); buffer = ''; });
  return { close: () => chain };
}

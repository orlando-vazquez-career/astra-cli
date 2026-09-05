// deployments.mjs — registro de despliegues del proyecto (.astra/deployments.json).
//
// Axioma A4 del protocolo: toda direccion desplegada queda registrada con cadena, red,
// direccion, tx, commit, fecha y estado de verificacion. El archivo es JSON (no JSONL)
// para que cualquier herramienta lo lea; la escritura es atomica y cada entrada se valida
// contra el registro de cadenas y el validador de direcciones de su familia.
import path from 'node:path';
import { readJson, writeAtomic, fechaLocalISO, gitHead, AstraError } from './util.mjs';
import { getChain } from './registry.mjs';
import { validateAddress } from './address.mjs';

export const DEPLOYMENTS_FILE = path.join('.astra', 'deployments.json');
export const KINDS = ['contract', 'token', 'account', 'other'];
const TX_BY_FAMILY = { evm: /^0x[0-9a-fA-F]{64}$/, stellar: /^[0-9a-fA-F]{64}$/, utxo: /^[0-9a-fA-F]{64}$/ };

export function emptyRegistry() {
  return { version: 1, deployments: [] };
}

export function readDeployments(cwd) {
  const file = path.join(cwd, DEPLOYMENTS_FILE);
  const data = readJson(file, null);
  if (data === null) return emptyRegistry();
  if (!data || typeof data !== 'object' || !Array.isArray(data.deployments)) {
    throw new AstraError(`${DEPLOYMENTS_FILE} no tiene la forma { version, deployments: [] }`, { code: 'DEPLOYMENTS_INVALIDO' });
  }
  return data;
}

// Valida y normaliza una entrada. No escribe.
export function validateEntry(entry) {
  const errors = [];
  const e = { ...entry };
  const chain = typeof e.chain === 'string' ? getChain(e.chain) : null;
  if (!chain) errors.push(`cadena desconocida: ${e.chain} (ver 'astra chain list')`);
  else {
    e.family = chain.family;
    if (e.network && e.network !== chain.network) errors.push(`la red ${e.network} no coincide con la de ${chain.id} (${chain.network})`);
    e.network = chain.network;
  }
  if (!KINDS.includes(e.kind)) errors.push(`kind debe ser uno de ${KINDS.join('|')}`);
  if (typeof e.label !== 'string' || !e.label.trim()) errors.push('label obligatorio');
  if (chain) {
    const v = validateAddress(chain.id, e.address);
    if (v.secret) errors.push('la direccion es una clave secreta: no se registra');
    else if (!v.valid) errors.push(`direccion invalida para ${chain.family}: ${v.reason}`);
    else e.address = v.normalized;
    if (e.tx !== undefined && e.tx !== null && e.tx !== '') {
      if (!TX_BY_FAMILY[chain.family].test(String(e.tx))) errors.push(`tx con formato invalido para ${chain.family}`);
    } else delete e.tx;
  }
  if (e.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(e.date))) errors.push('date debe ser YYYY-MM-DD');
  e.verified = e.verified === true || e.verified === 'true';
  for (const k of ['commit', 'wasmHash', 'verificationUrl', 'notes']) {
    if (e[k] === undefined || e[k] === null || e[k] === '') delete e[k];
    else e[k] = String(e[k]);
  }
  if (e.verificationUrl && !/^https:\/\//.test(e.verificationUrl)) errors.push('verificationUrl debe ser https');
  return { ok: errors.length === 0, errors, normalized: e };
}

export function addDeployment(cwd, entry, { force = false, today = fechaLocalISO() } = {}) {
  const v = validateEntry(entry);
  if (!v.ok) throw new AstraError(`entrada invalida:\n  - ${v.errors.join('\n  - ')}`, { code: 'DEPLOYMENT_INVALIDO', exitCode: 2 });
  const reg = readDeployments(cwd);
  const e = v.normalized;
  const dup = reg.deployments.find(d => d.chain === e.chain && d.address === e.address);
  if (dup && !force) throw new AstraError(`entrada duplicada: ${e.address} ya esta registrada en ${e.chain} como '${dup.label}' (usar --force para agregar igual)`, { code: 'DEPLOYMENT_DUPLICADO', exitCode: 2 });
  e.date = e.date || today;
  if (!e.commit) { const head = gitHead(cwd); if (head) e.commit = head; }
  e.id = `dpl_${e.date.replace(/-/g, '')}_${reg.deployments.length + 1}`;
  const ordered = { id: e.id, chain: e.chain, family: e.family, network: e.network, kind: e.kind, label: e.label.trim(), address: e.address, ...(e.tx ? { tx: e.tx } : {}), ...(e.commit ? { commit: e.commit } : {}), ...(e.wasmHash ? { wasmHash: e.wasmHash } : {}), date: e.date, verified: e.verified, ...(e.verificationUrl ? { verificationUrl: e.verificationUrl } : {}), ...(e.notes ? { notes: e.notes } : {}) };
  reg.deployments.push(ordered);
  writeAtomic(path.join(cwd, DEPLOYMENTS_FILE), JSON.stringify(reg, null, 2) + '\n');
  return ordered;
}

// init.mjs — deja un repo listo para trabajar con ASTRA. Idempotente: se puede correr
// mil veces; solo crea lo que falta y reemplaza sus propios bloques marcados.
//
// Crea:  .astra/astra.json (config) · .astra/deployments.json (registro vacio) ·
//        docs/astra/{orbit,chart,audit,launch}.md desde las plantillas del protocolo ·
//        docs/astra/devlogs/.gitkeep
// Edita: .gitignore (bloque # astra:start/end con .env y material de claves) ·
//        AGENTS.md, CLAUDE.md, GEMINI.md (bloque <!-- astra:start --> ... <!-- astra:end -->)
// Copia: skills del protocolo a los runtimes elegidos (syncSkills).
// Nunca pisa un archivo del usuario fuera de sus bloques marcados.
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic, fechaLocalISO } from './util.mjs';
import { getChain } from './registry.mjs';
import { emptyRegistry, DEPLOYMENTS_FILE } from './deployments.mjs';
import { syncSkills } from './skills.mjs';

export const BLOCK_START = '<!-- astra:start -->';
export const BLOCK_END = '<!-- astra:end -->';
export const GITIGNORE_START = '# astra:start';
export const GITIGNORE_END = '# astra:end';

export function upsertBlock(text, block, { start = BLOCK_START, end = BLOCK_END } = {}) {
  const base = text || '';
  const i = base.indexOf(start);
  const j = base.indexOf(end);
  if (i >= 0 && j > i) return base.slice(0, i) + block + base.slice(j + end.length);
  const sep = base.length === 0 ? '' : base.endsWith('\n\n') ? '' : base.endsWith('\n') ? '\n' : '\n\n';
  return base + sep + block + '\n';
}

export function astraBlock({ chains = [], protocolDir = null } = {}) {
  const chainLines = chains.length
    ? chains.map(id => { const c = getChain(id); return c ? `- \`${c.id}\` (${c.family}, ${c.network}${c.chainId ? `, chainId ${c.chainId}` : ''})` : `- \`${id}\``; }).join('\n')
    : '- (sin cadenas declaradas todavia: `astra init --chain <id>`; ver `astra chain list`)';
  return `${BLOCK_START}
## ASTRA — protocolo de desarrollo Web3

Este repo sigue **ASTRA**${protocolDir ? ` (protocolo en \`${protocolDir.split(path.sep).join('/')}/ASTRA-PROTOCOL.md\`)` : ''}: siete fases con dos gates humanos.

\`\`\`
Orbita → Carta → ⸸ Gate 1: Carta aprobada ⸸ → Construccion → Ensayo → Auditoria → ⸸ Gate 2: Mainnet ⸸ → Lanzamiento → Bitacora
\`\`\`

Cadenas de este proyecto:
${chainLines}

Artefactos: \`docs/astra/orbit.md\` (perfil de cadena y capacidad) · \`docs/astra/chart.md\` (diseño; Gate 1 = linea \`aprobada: YYYY-MM-DD\`) · \`.astra/deployments.json\` (todo lo desplegado, A4) · \`docs/astra/audit.md\` (hallazgos y \`veredicto: apto\`) · \`docs/astra/launch.md\` (Gate 2: \`firmado_por\`, \`fecha_firma\`, \`costo_estimado\`) · \`docs/astra/devlogs/\` (bitacora).

Reglas que no se rompen:
- **A1** Mainnet es irreversible: nada llega a mainnet sin Gate 2 firmado por un humano en \`launch.md\`.
- **A2** Las claves no existen para el agente: nunca leer, pedir, imprimir ni registrar claves privadas, seeds ni mnemonicos. Se firma con alias del keystore nativo (\`--source-account <alias>\`, \`cast wallet\`). Alias de testnet y mainnet distintos.
- **A3** Testnet primero, siempre. **A7** Los agentes no mueven fondos de mainnet, ni con permiso.
- Toda direccion desplegada se registra con \`astra deployments add\`; toda direccion que se pega se valida con \`astra address\`.

Herramienta \`astra\` (CLI y MCP): \`astra doctor\` (capacidad por cadena) · \`astra chain probe <id>\` · \`astra check\` (secretos e higiene) · \`astra check --gate mainnet\` (checklist del Gate 2, debe salir OK antes de lanzar) · \`astra standards search "<tema>"\`.
${BLOCK_END}`;
}

function gitignoreBlock() {
  return `${GITIGNORE_START}
.env
.env.*
!.env.example
.stellar/identity/
.soroban/identity/
${GITIGNORE_END}`;
}

export function initProject({ cwd, chains = [], runtimes = ['claude', 'codex'], protocolDir = null, today = fechaLocalISO() }) {
  const created = [];
  const updated = [];
  const skipped = [];
  const warnings = [];
  const rel = p => path.relative(cwd, p).split(path.sep).join('/');
  const ensureFile = (file, content) => {
    if (fs.existsSync(file)) { skipped.push(rel(file)); return false; }
    writeAtomic(file, content);
    created.push(rel(file));
    return true;
  };
  for (const id of chains) if (!getChain(id)) warnings.push(`cadena desconocida en --chain: ${id} (ver astra chain list)`);

  const cfgFile = path.join(cwd, '.astra', 'astra.json');
  if (fs.existsSync(cfgFile)) {
    let cfg = {};
    try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { cfg = {}; }
    const merged = { ...cfg, protocol: 'ASTRA', chains: [...new Set([...(cfg.chains || []), ...chains])], runtimes: [...new Set([...(cfg.runtimes || []), ...runtimes])], updatedAt: today };
    if (JSON.stringify(merged) !== JSON.stringify(cfg)) { writeAtomic(cfgFile, JSON.stringify(merged, null, 2) + '\n'); updated.push(rel(cfgFile)); } else skipped.push(rel(cfgFile));
  } else {
    ensureFile(cfgFile, JSON.stringify({ version: 1, protocol: 'ASTRA', protocolVersion: '0.1.0', chains, runtimes, createdAt: today }, null, 2) + '\n');
  }
  ensureFile(path.join(cwd, DEPLOYMENTS_FILE), JSON.stringify(emptyRegistry(), null, 2) + '\n');

  const docs = path.join(cwd, 'docs', 'astra');
  for (const name of ['orbit', 'chart', 'audit', 'launch']) {
    const dest = path.join(docs, `${name}.md`);
    const tpl = protocolDir ? path.join(protocolDir, 'templates', `${name}.template.md`) : null;
    if (tpl && fs.existsSync(tpl)) ensureFile(dest, fs.readFileSync(tpl, 'utf8'));
    else if (!fs.existsSync(dest)) { ensureFile(dest, `# ${name}\n\n<!-- plantilla no disponible: correr 'astra protocol fetch' y luego 'astra init' de nuevo -->\n`); if (!protocolDir) warnings.push(`sin protocolo resoluble: docs/astra/${name}.md quedo como esqueleto; correr 'astra protocol fetch' (o --protocol-dir) y repetir 'astra init'`); }
    else skipped.push(rel(dest));
  }
  ensureFile(path.join(docs, 'devlogs', '.gitkeep'), '');

  const gi = path.join(cwd, '.gitignore');
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const giNext = upsertBlock(giText, gitignoreBlock(), { start: GITIGNORE_START, end: GITIGNORE_END });
  if (giNext !== giText) { writeAtomic(gi, giNext); (giText ? updated : created).push('.gitignore'); } else skipped.push('.gitignore');

  const block = astraBlock({ chains, protocolDir });
  for (const name of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
    const file = path.join(cwd, name);
    const exists = fs.existsSync(file);
    const text = exists ? fs.readFileSync(file, 'utf8') : `# ${name.replace('.md', '')}\n`;
    const next = upsertBlock(text, block);
    if (!exists) { writeAtomic(file, next); created.push(name); } else if (next !== text) { writeAtomic(file, next); updated.push(name); } else skipped.push(name);
  }

  const skillsDir = protocolDir ? path.join(protocolDir, 'skills') : null;
  if (skillsDir && fs.existsSync(skillsDir)) {
    const r = syncSkills({ from: skillsDir, to: cwd, runtimes });
    created.push(...r.written);
  } else if (!protocolDir) {
    warnings.push("sin protocolo resoluble no se instalaron skills: correr 'astra protocol fetch' y luego 'astra skills sync'");
  }
  return { created, updated, skipped, warnings };
}

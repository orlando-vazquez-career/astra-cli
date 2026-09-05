// check.mjs — escaner de secretos, higiene del repo y gate de mainnet.
//
// Es la herramienta de los axiomas A2 (las claves no existen para el agente) y A1
// (nada llega a mainnet sin Gate 2). Tres capas:
//   1. Secretos por linea: semillas StrKey (S...), claves privadas EVM con contexto,
//      mnemonicos, asignaciones sospechosas. Un finding NUNCA incluye el valor.
//   2. Higiene por archivo: .env versionados, material de claves versionado, .gitignore
//      sin .env, registro de despliegues invalido.
//   3. Gate de mainnet (--gate mainnet): carta aprobada, testnet registrada, auditoria
//      apta sin hallazgos criticos/altos abiertos, launch firmado, cero secretos.
// Alcance: archivos trackeados + no trackeados no ignorados (git) o un walk del
// directorio; se saltan binarios, lockfiles, node_modules/, target/, dist/, .git/.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodeStrKey } from './address.mjs';
import { validateEntry } from './deployments.mjs';
import { DEPLOYMENTS_FILE } from './deployments.mjs';

const SKIP_DIRS = new Set(['node_modules', 'target', 'dist', '.git', 'build', '.next', 'coverage']);
const SKIP_FILES = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|.*\.lock)$/;
const MAX_BYTES = 1024 * 1024;
const ENV_FILE = /(^|\/)\.env(\..+)?$/;
const ENV_EXAMPLE = /\.env\.(example|sample|template)$/;
const KEY_MATERIAL = /(^|\/)(\.stellar|\.soroban)\/identity\/|\.keystore$|(^|\/)keystore\/.*\.json$|\.pem$|(^|\/)id_(rsa|ed25519)$/;
const KEY_CONTEXT = /(private[_-]?key|privkey|priv_key|secret|mnemonic|seed|deployer|signer)/i;
const PLACEHOLDER = /(your|xxx|changeme|example|<|\$\{|placeholder|redacted|\.\.\.)/i;
const ASSIGNMENT = /^\s*(?:(?:export|const|let|var)\s+)?[A-Za-z0-9_]*(PRIVATE_KEY|SECRET_KEY|SECRET|MNEMONIC|SEED)[A-Za-z0-9_]*\s*[=:]\s*["']?([^"'\s]{16,})/;

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

function isGitRepo(dir) {
  return git(dir, ['rev-parse', '--is-inside-work-tree']) !== null;
}

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(path.join(dir, ent.name), base, out); continue; }
    if (ent.isFile()) out.push(path.relative(base, path.join(dir, ent.name)).split(path.sep).join('/'));
  }
  return out;
}

// Devuelve rutas relativas con '/' y el conjunto de las trackeadas por git (vacio si no hay git).
export function listFiles(dir) {
  if (isGitRepo(dir)) {
    const tracked = (git(dir, ['ls-files', '-z']) || '').split('\0').filter(Boolean);
    const untracked = (git(dir, ['ls-files', '-z', '-o', '--exclude-standard']) || '').split('\0').filter(Boolean);
    const all = [...new Set([...tracked, ...untracked])].filter(f => !f.split('/').some(seg => SKIP_DIRS.has(seg)));
    return { files: all, tracked: new Set(tracked), git: true };
  }
  return { files: walk(dir), tracked: new Set(), git: false };
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

function finding(rule, severity, file, line, hint) {
  return { rule, severity, file, ...(line ? { line } : {}), hint };
}

// Reglas por linea. Nunca devuelven el valor detectado.
export function scanFile(file, text) {
  const out = [];
  const lines = text.split(/\r?\n/);
  const isExample = ENV_EXAMPLE.test(file);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const n = i + 1;
    const seeds = line.match(/\bS[A-Z2-7]{55}\b/g) || [];
    if (seeds.some(s => decodeStrKey(s).secret === true)) {
      out.push(finding('stellar-secret-seed', 'error', file, n, 'semilla secreta StrKey (S...) con checksum valido: rotarla y sacarla del repo (usar alias del keystore de Stellar CLI)'));
      continue;
    }
    if (/\b(?:0x)?[0-9a-fA-F]{64}\b/.test(line) && KEY_CONTEXT.test(line)) {
      out.push(finding('evm-private-key', 'error', file, n, 'hex de 64 junto a private key/secret/mnemonic/seed: parece una clave privada EVM; usar cast wallet import <alias> y variables no versionadas'));
      continue;
    }
    if (/(mnemonic|seed[ _-]?phrase|frase semilla)/i.test(line)) {
      const words = (line.match(/\b[a-z]{3,8}\b/g) || []).length;
      if (words >= 12 && !isExample) {
        out.push(finding('mnemonic', 'error', file, n, 'linea con mnemonico de 12+ palabras: nunca en el repo ni en un chat'));
        continue;
      }
    }
    const m = line.match(ASSIGNMENT);
    if (m && !isExample && !PLACEHOLDER.test(m[2]) && !/PASSPHRASE/.test(line)) {
      out.push(finding('secret-assignment', 'warn', file, n, `asignacion a una variable *${m[1]}* con valor real: mover a variables de entorno no versionadas`));
    }
  }
  return out;
}

function hasEnvIgnore(gitignoreText) {
  return gitignoreText.split(/\r?\n/).some(l => ['.env', '.env*', '.env.*', '*.env'].includes(l.trim()));
}

function fileText(dir, rel) {
  try { return fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { return null; }
}

function gateMainnet(dir, findings) {
  const items = [];
  const chart = fileText(dir, 'docs/astra/chart.md');
  items.push({ name: 'carta-aprobada', ok: !!chart && /^aprobada:\s*\d{4}-\d{2}-\d{2}\s*$/m.test(chart), detail: chart ? 'docs/astra/chart.md necesita la linea "aprobada: YYYY-MM-DD" (Gate 1)' : 'falta docs/astra/chart.md' });
  let testnet = false;
  let regDetail = 'falta .astra/deployments.json con una entrada network=testnet (fase Ensayo)';
  try {
    const reg = JSON.parse(fileText(dir, DEPLOYMENTS_FILE.split(path.sep).join('/')) || 'null');
    if (reg && Array.isArray(reg.deployments)) {
      testnet = reg.deployments.some(d => d.network === 'testnet');
      if (!testnet) regDetail = 'el registro no tiene ningun despliegue en testnet (A3: testnet primero)';
    }
  } catch { regDetail = '.astra/deployments.json no es JSON valido'; }
  items.push({ name: 'testnet-desplegada', ok: testnet, detail: regDetail });
  const audit = fileText(dir, 'docs/astra/audit.md');
  let auditOk = false;
  let auditDetail = 'falta docs/astra/audit.md';
  if (audit) {
    const apto = /^veredicto:\s*apto\s*$/m.test(audit);
    const abiertas = audit.split(/\r?\n/).filter(l => /^\s*\|/.test(l)).map(l => l.split('|').map(c => c.trim().toLowerCase()))
      .filter(cols => cols.length >= 4 && /^(critica|crítica|alta)$/.test(cols[2]) && /^(abierta|abierto)$/.test(cols[3]));
    auditOk = apto && abiertas.length === 0;
    auditDetail = !apto ? 'docs/astra/audit.md necesita "veredicto: apto"' : abiertas.length ? `${abiertas.length} hallazgo(s) critico/alto abierto(s) en audit.md` : 'ok';
  }
  items.push({ name: 'auditoria-apta', ok: auditOk, detail: auditDetail });
  const launch = fileText(dir, 'docs/astra/launch.md');
  let launchOk = false;
  let launchDetail = 'falta docs/astra/launch.md';
  if (launch) {
    const firmado = launch.match(/^firmado_por:\s*(.+)$/m);
    const fecha = /^fecha_firma:\s*\d{4}-\d{2}-\d{2}\s*$/m.test(launch);
    const costo = launch.match(/^costo_estimado:\s*(.+)$/m);
    const ok = v => v && v[1].trim() && !/^<.*>$/.test(v[1].trim());
    launchOk = ok(firmado) && fecha && ok(costo);
    launchDetail = launchOk ? 'ok' : 'docs/astra/launch.md necesita firmado_por, fecha_firma (YYYY-MM-DD) y costo_estimado sin placeholders (Gate 2, A1, A10)';
  }
  items.push({ name: 'launch-firmado', ok: launchOk, detail: launchDetail });
  const errores = findings.filter(f => f.severity === 'error').length;
  items.push({ name: 'sin-secretos', ok: errores === 0, detail: errores ? `${errores} hallazgo(s) de severidad error` : 'ok' });
  return { ok: items.every(i => i.ok), items };
}

export function checkRepo(dir, { gate } = {}) {
  const findings = [];
  const { files, tracked, git: hasGit } = listFiles(dir);
  for (const rel of files) {
    if (SKIP_FILES.test(rel)) continue;
    if (tracked.has(rel) && ENV_FILE.test(rel) && !ENV_EXAMPLE.test(rel)) findings.push(finding('env-tracked', 'error', rel, null, 'archivo .env versionado: sacarlo del indice (git rm --cached) y agregarlo a .gitignore'));
    if (tracked.has(rel) && KEY_MATERIAL.test(rel)) findings.push(finding('key-material-tracked', 'error', rel, null, 'material de claves versionado (identity/keystore/pem): sacarlo del repo y rotar'));
    let buf;
    try { buf = fs.readFileSync(path.join(dir, rel)); } catch { continue; }
    if (buf.length > MAX_BYTES || isBinary(buf)) continue;
    findings.push(...scanFile(rel, buf.toString('utf8')));
  }
  const gi = fileText(dir, '.gitignore');
  if (hasGit || fs.existsSync(path.join(dir, '.git'))) {
    if (!gi || !hasEnvIgnore(gi)) findings.push(finding('gitignore-env', 'warn', '.gitignore', null, 'agregar .env y .env.* al .gitignore (astra init lo hace)'));
  } else if (!gi || !hasEnvIgnore(gi)) {
    findings.push(finding('gitignore-env', 'warn', '.gitignore', null, 'agregar .env y .env.* al .gitignore (astra init lo hace)'));
  }
  const depRel = DEPLOYMENTS_FILE.split(path.sep).join('/');
  const depText = fileText(dir, depRel);
  if (depText !== null) {
    try {
      const reg = JSON.parse(depText);
      if (!reg || !Array.isArray(reg.deployments)) findings.push(finding('deployments-invalid', 'error', depRel, null, 'debe tener la forma { version, deployments: [] }'));
      else reg.deployments.forEach((d, i) => { const v = validateEntry(d); if (!v.ok) findings.push(finding('deployments-invalid', 'error', depRel, i + 1, `entrada ${d.id || i + 1}: ${v.errors.join('; ')}`)); });
    } catch { findings.push(finding('deployments-invalid', 'error', depRel, null, 'no es JSON valido')); }
  }
  const out = { ok: !findings.some(f => f.severity === 'error'), findings, scanned: files.length };
  if (gate === 'mainnet') {
    out.gate = gateMainnet(dir, findings);
    out.ok = out.ok && out.gate.ok;
  } else if (gate) {
    throw new Error(`gate desconocido: ${gate} (solo 'mainnet')`);
  }
  return out;
}

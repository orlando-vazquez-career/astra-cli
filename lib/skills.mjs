// skills.mjs — sincronizacion de skills (formato Agent Skills: <nombre>/SKILL.md) hacia los
// directorios que lee cada runtime de IA. El canonico es la fuente de verdad; las copias
// llevan una cabecera de "GENERADO" y `--check` detecta cualquier desvio.
//
// Sirve para dos cosas: (1) que el repo del protocolo funcione en todos los runtimes sin
// symlinks (que fallan en Windows), y (2) instalar packs de skills externos en un proyecto
// (`astra skills sync --from <dir-de-skills>`).
import fs from 'node:fs';
import path from 'node:path';
import { writeAtomic } from './util.mjs';

export const RUNTIME_DIRS = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  antigravity: '.agents/skills',
  kimi: '.kimi-code/skills',
  cursor: '.cursor/skills',
};

export function expandRuntimes(list) {
  const names = Array.isArray(list) ? list : String(list || '').split(',');
  const flat = names.flatMap(n => String(n).trim()).filter(Boolean);
  const chosen = flat.includes('all') ? Object.keys(RUNTIME_DIRS) : flat;
  const dirs = [];
  for (const n of chosen) {
    const d = RUNTIME_DIRS[n];
    if (!d) throw new Error(`runtime desconocido: ${n} (validos: ${Object.keys(RUNTIME_DIRS).join(', ')}, all)`);
    if (!dirs.includes(d)) dirs.push(d);
  }
  return dirs;
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function renderGenerated(text, relSource) {
  const header = `<!-- GENERADO por astra skills sync desde ${relSource} — no editar a mano; editar el canonico y re-correr el sync -->\n`;
  const m = text.match(FRONTMATTER);
  if (!m) return header + text;
  return m[0] + header + text.slice(m[0].length);
}

function listSkillDirs(from) {
  if (!fs.existsSync(from)) return [];
  return fs.readdirSync(from, { withFileTypes: true })
    .filter(e => e.isDirectory() && fs.existsSync(path.join(from, e.name, 'SKILL.md')))
    .map(e => e.name)
    .sort();
}

function walkFiles(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, base, out);
    else if (e.isFile()) out.push(path.relative(base, p));
  }
  return out;
}

export function syncSkills({ from, to, runtimes = ['claude', 'codex'], check = false }) {
  const targets = expandRuntimes(runtimes);
  const skills = listSkillDirs(from);
  const written = [];
  const stale = [];
  for (const skill of skills) {
    const srcDir = path.join(from, skill);
    for (const rel of walkFiles(srcDir)) {
      const src = path.join(srcDir, rel);
      const isMd = rel.toLowerCase().endsWith('.md');
      const raw = fs.readFileSync(src);
      const relSource = path.relative(to, src).split(path.sep).join('/');
      const expected = isMd ? Buffer.from(renderGenerated(raw.toString('utf8'), relSource)) : raw;
      for (const target of targets) {
        const dest = path.join(to, target, skill, rel);
        const current = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
        const same = current && current.equals(expected);
        if (check) { if (!same) stale.push(path.relative(to, dest).split(path.sep).join('/')); continue; }
        if (!same) { writeAtomic(dest, expected); written.push(path.relative(to, dest).split(path.sep).join('/')); }
      }
    }
  }
  return { skills, targets, written, stale, ok: check ? stale.length === 0 : true };
}

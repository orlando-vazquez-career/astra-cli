// util.mjs — utilidades sin estado compartidas por todos los comandos. Cero dependencias.
//
// Todo lo que toca el sistema operativo vive aca: buscar ejecutables (PATH + PATHEXT en
// Windows), ejecutar `--version` de forma segura, escribir archivos de forma atomica
// (temporal + rename con reintentos, porque en Windows el rename falla si otro proceso
// tiene abierto el destino), leer JSON con fallback y fechas de calendario local.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const isWindows = process.platform === 'win32';

export class AstraError extends Error {
  constructor(message, { code = 'ASTRA_ERROR', exitCode = 1 } = {}) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

// Fecha del calendario LOCAL en YYYY-MM-DD (toISOString daria el dia UTC).
export function fechaLocalISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Busca un ejecutable en PATH. En Windows prueba cada extension de PATHEXT.
export function findExecutable(name, env = process.env) {
  const pathVar = env.PATH ?? env.Path ?? '';
  const dirs = pathVar.split(path.delimiter).filter(Boolean);
  const exts = isWindows ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  const alreadyHasExt = isWindows && exts.some(e => name.toLowerCase().endsWith(e.toLowerCase()));
  for (const dir of dirs) {
    const candidates = (!isWindows || alreadyHasExt)
      ? [path.join(dir, name)]
      : exts.map(e => path.join(dir, name + e.toLowerCase()));
    for (const c of candidates) {
      try {
        const st = fs.statSync(c);
        if (!st.isFile()) continue;
        if (!isWindows) fs.accessSync(c, fs.constants.X_OK);
        return c;
      } catch {
        // siguiente candidato
      }
    }
  }
  return null;
}

// Primera linea no vacia de `<file> --version` (stdout o stderr). null si no se pudo ejecutar.
// Los .cmd/.bat de Windows solo corren a traves del shell.
export function runVersion(file, args = ['--version'], { timeoutMs = 8000 } = {}) {
  const ext = path.extname(file).toLowerCase();
  const needsShell = isWindows && (ext === '.cmd' || ext === '.bat');
  const r = needsShell
    ? spawnSync(`"${file}"`, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell: true })
    : spawnSync(file, args, { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  if (r.error) return null;
  return `${r.stdout || ''}\n${r.stderr || ''}`.split(/\r?\n/).map(s => s.trim()).find(Boolean) || null;
}

function esperar(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Escritura atomica: temporal propio + rename, con reintentos ante EPERM/EBUSY/EACCES.
export function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  for (let intento = 1; ; intento++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      const transitorio = err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES';
      if (!transitorio || intento >= 5) {
        try { fs.rmSync(tmp, { force: true }); } catch { /* nada que hacer */ }
        throw err;
      }
      esperar(40 * intento);
    }
  }
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

export function homeDir(env = process.env) {
  return env.ASTRA_HOME || os.homedir();
}

export function gitHead(cwd) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

// Normaliza texto para busquedas: minusculas y sin acentos.
export function normalizeText(s) {
  return String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

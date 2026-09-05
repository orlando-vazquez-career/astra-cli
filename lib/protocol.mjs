// protocol.mjs — donde vive el protocolo ASTRA (plantillas y skills) y como traerlo.
//
// El CLI no vendoriza el protocolo: lo resuelve en este orden y usa el primero que exista
// (un directorio con ASTRA-PROTOCOL.md):
//   1. --protocol-dir explicito
//   2. $ASTRA_PROTOCOL_DIR
//   3. ~/.astra/protocol (donde clona `astra protocol fetch`)
//   4. ../../protocols/ASTRA relativo a este CLI (layout <raiz>/tools/astra-cli + <raiz>/protocols/ASTRA)
//   5. ./ASTRA en el directorio actual
// `fetch` es la unica operacion de red de este modulo y solo corre cuando se la pide.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homeDir, findExecutable, AstraError } from './util.mjs';

export const PROTOCOL_REPO_URL = 'https://github.com/orlando-vazquez-career/astra-protocol.git';
export const PROTOCOL_MARKER = 'ASTRA-PROTOCOL.md';

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isProtocolDir = dir => !!dir && fs.existsSync(path.join(dir, PROTOCOL_MARKER));

export function protocolHomeDir(env = process.env) {
  return path.join(homeDir(env), '.astra', 'protocol');
}

export function resolveProtocolDir({ explicit, env = process.env, home, cliRoot = CLI_ROOT, cwd = process.cwd() } = {}) {
  const homeBase = home || homeDir(env);
  const candidates = [
    ['explicit', explicit],
    ['env', env.ASTRA_PROTOCOL_DIR],
    ['home', path.join(homeBase, '.astra', 'protocol')],
    ['sibling', path.resolve(cliRoot, '..', '..', 'protocols', 'ASTRA')],
    ['cwd', path.resolve(cwd, 'ASTRA')],
  ];
  for (const [source, dir] of candidates) {
    if (dir && isProtocolDir(dir)) return { dir: path.resolve(dir), source };
  }
  return null;
}

export function fetchProtocol({ dest, env = process.env, findExec = findExecutable } = {}) {
  const target = dest || protocolHomeDir(env);
  const git = findExec('git', env);
  if (!git) throw new AstraError('git no esta en PATH: hace falta para clonar el protocolo (o descargarlo a mano y usar --protocol-dir)');
  if (isProtocolDir(target)) {
    const r = spawnSync(git, ['-C', target, 'pull', '--ff-only'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    if (r.status !== 0) throw new AstraError(`git pull fallo en ${target}: ${(r.stderr || r.stdout || '').trim()}`);
    return { dir: target, action: 'updated' };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const r = spawnSync(git, ['clone', '--depth', '1', PROTOCOL_REPO_URL, target], { encoding: 'utf8', windowsHide: true, timeout: 180000 });
  if (r.status !== 0) throw new AstraError(`git clone fallo: ${(r.stderr || r.stdout || '').trim()}`);
  return { dir: target, action: 'cloned' };
}

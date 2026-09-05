// cli.mjs — parseo de argumentos, tabla de comandos, ayuda y codigos de salida.
//
// Convenciones para todos los comandos (lib/commands/<nombre>.mjs):
//   export async function run({ args, flags, stdout, stderr }) → number (codigo de salida)
//   0 = ok · 1 = fallo de verificacion o de red · 2 = error de uso.
//   Con --json se imprime el objeto crudo; sin el, texto con marcadores ASCII OK / WARN / FAIL.
import { createRequire } from 'node:module';
import { AstraError } from './util.mjs';

const pkg = createRequire(import.meta.url)('../package.json');
export const VERSION = pkg.version;

// Flags que nunca consumen el argumento siguiente.
const BOOLEANS = new Set(['json', 'check', 'force', 'verified', 'help', 'version', 'fetch', 'no-open']);

export function parseArgs(argv, { booleans = BOOLEANS } = {}) {
  const out = { _: [], flags: {} };
  const push = (k, v) => {
    if (k in out.flags) out.flags[k] = [].concat(out.flags[k], v);
    else out.flags[k] = v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq > 0) { push(a.slice(2, eq), a.slice(eq + 1)); continue; }
    const key = a.slice(2);
    if (booleans.has(key) || i + 1 >= argv.length || argv[i + 1].startsWith('--')) push(key, true);
    else push(key, argv[++i]);
  }
  return out;
}

export const HELP = `astra ${VERSION} — herramientas del protocolo ASTRA (Web3 agentico, multi-cadena, multi-vendor)

Uso: astra <comando> [opciones]

  doctor [--chain <id>]                  toolchains presentes y veredicto SAFE/CAUTION/AVOID por familia
  chain list | info <id> | probe <id> [--rpc <url>]
                                         registro de cadenas y salud en vivo
  address <cadena|familia> <direccion>   valida formato y checksum (nunca imprime claves secretas)
  init [--chain <id>]... [--runtimes claude,codex,kimi,cursor,antigravity,all] [--protocol-dir <p>]
                                         prepara un repo para ASTRA (.astra/, docs/astra/, bloque en AGENTS.md)
  check [--gate mainnet]                 escaner de secretos, higiene y gate de mainnet (exit 1 si falla)
  deployments list | add --chain <id> --address <a> [--kind contract] [--label <l>] [--tx <t>] [--verified]
  standards search <consulta> [--family stellar|evm|syscoin|base|payments|caip]
  skills sync [--from <dir>] [--runtimes ...] [--check]
  protocol path | fetch [--dir <p>]      donde vive el protocolo / clonarlo
  mcp                                    servidor MCP por stdio

Opciones globales: --json (salida JSON), --help, --version
`;

const COMMANDS = {
  doctor: () => import('./commands/doctor.mjs'),
  chain: () => import('./commands/chain.mjs'),
  address: () => import('./commands/address.mjs'),
  init: () => import('./commands/init.mjs'),
  check: () => import('./commands/check.mjs'),
  deployments: () => import('./commands/deployments.mjs'),
  standards: () => import('./commands/standards.mjs'),
  skills: () => import('./commands/skills.mjs'),
  protocol: () => import('./commands/protocol.mjs'),
  mcp: () => import('./commands/mcp.mjs'),
};

export async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = parseArgs(argv);
  if (args.flags.version) { stdout.write(`astra ${VERSION}\n`); return 0; }
  const [cmd, ...rest] = args._;
  if (!cmd) { stdout.write(HELP); return args.flags.help ? 0 : 2; }
  const loader = COMMANDS[cmd];
  if (!loader) { stderr.write(`astra: comando desconocido '${cmd}'. Proba 'astra --help'.\n`); return 2; }
  try {
    const mod = await loader();
    return (await mod.run({ args: rest, flags: args.flags, stdout, stderr })) ?? 0;
  } catch (err) {
    if (err instanceof AstraError) { stderr.write(`astra: ${err.message}\n`); return err.exitCode; }
    stderr.write(`astra: error inesperado: ${err && err.stack ? err.stack : err}\n`);
    return 1;
  }
}

// Ayudas compartidas por los comandos.
export function emitJson(stdout, obj) { stdout.write(JSON.stringify(obj, null, 2) + '\n'); }
export function usage(stderr, text) { stderr.write(`astra: ${text}\n`); return 2; }

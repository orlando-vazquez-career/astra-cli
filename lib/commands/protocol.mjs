// commands/protocol.mjs — `astra protocol path | fetch [--dir <p>]`.
import { resolveProtocolDir, fetchProtocol, PROTOCOL_REPO_URL } from '../protocol.mjs';
import { emitJson, usage } from '../cli.mjs';

export async function run({ args, flags, stdout, stderr }) {
  const [sub] = args;
  if (sub === 'path') {
    const p = resolveProtocolDir({ explicit: typeof flags['protocol-dir'] === 'string' ? flags['protocol-dir'] : undefined });
    if (flags.json) { emitJson(stdout, p || { dir: null }); return p ? 0 : 1; }
    if (!p) { stdout.write(`FAIL no encuentro el protocolo ASTRA. Opciones: astra protocol fetch (clona ${PROTOCOL_REPO_URL} en ~/.astra/protocol), ASTRA_PROTOCOL_DIR=<dir>, o --protocol-dir <dir>\n`); return 1; }
    stdout.write(`OK   ${p.dir} (fuente: ${p.source})\n`);
    return 0;
  }
  if (sub === 'fetch') {
    const r = fetchProtocol({ dest: typeof flags.dir === 'string' ? flags.dir : undefined });
    if (flags.json) { emitJson(stdout, r); return 0; }
    stdout.write(`OK   protocolo ${r.action === 'cloned' ? 'clonado' : 'actualizado'} en ${r.dir}\n`);
    return 0;
  }
  return usage(stderr, 'uso: astra protocol path | fetch [--dir <p>]');
}

// commands/init.mjs — `astra init [--chain <id>]... [--runtimes a,b] [--protocol-dir <p>] [--json]`.
import { initProject } from '../init.mjs';
import { resolveProtocolDir } from '../protocol.mjs';
import { emitJson } from '../cli.mjs';

export async function run({ flags, stdout }) {
  const chains = flags.chain ? [].concat(flags.chain).filter(v => typeof v === 'string') : [];
  const runtimes = typeof flags.runtimes === 'string' ? flags.runtimes.split(',').map(s => s.trim()).filter(Boolean) : ['claude', 'codex'];
  const p = resolveProtocolDir({ explicit: typeof flags['protocol-dir'] === 'string' ? flags['protocol-dir'] : undefined });
  const r = initProject({ cwd: process.cwd(), chains, runtimes, protocolDir: p ? p.dir : null });
  if (flags.json) { emitJson(stdout, { protocolDir: p ? p.dir : null, ...r }); return 0; }
  stdout.write(`protocolo: ${p ? `${p.dir} (${p.source})` : 'no encontrado'}\n`);
  for (const f of r.created) stdout.write(`OK   creado     ${f}\n`);
  for (const f of r.updated) stdout.write(`OK   actualizado ${f}\n`);
  for (const f of r.skipped) stdout.write(`--   ya estaba  ${f}\n`);
  for (const w of r.warnings) stdout.write(`WARN ${w}\n`);
  stdout.write(`\nSiguiente paso: abrir docs/astra/orbit.md y correr 'astra doctor'${chains.length ? ` --chain ${chains[0]}` : ''}.\n`);
  return 0;
}

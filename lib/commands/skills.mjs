// commands/skills.mjs — `astra skills sync [--from <dir>] [--runtimes a,b] [--check] [--json]`.
import path from 'node:path';
import { syncSkills, RUNTIME_DIRS } from '../skills.mjs';
import { resolveProtocolDir } from '../protocol.mjs';
import { emitJson, usage } from '../cli.mjs';

export async function run({ args, flags, stdout, stderr }) {
  if (args[0] !== 'sync') return usage(stderr, `uso: astra skills sync [--from <dir>] [--runtimes ${Object.keys(RUNTIME_DIRS).join(',')},all] [--check]`);
  const cwd = process.cwd();
  let from = typeof flags.from === 'string' ? path.resolve(cwd, flags.from) : null;
  if (!from) {
    const p = resolveProtocolDir({ explicit: typeof flags['protocol-dir'] === 'string' ? flags['protocol-dir'] : undefined });
    if (!p) return usage(stderr, 'no encuentro el protocolo ASTRA: usar --from <dir-de-skills>, --protocol-dir <p> o `astra protocol fetch`');
    from = path.join(p.dir, 'skills');
  }
  const runtimes = typeof flags.runtimes === 'string' ? flags.runtimes : 'claude,codex';
  const r = syncSkills({ from, to: cwd, runtimes, check: flags.check === true });
  if (flags.json) { emitJson(stdout, r); return r.ok ? 0 : 1; }
  if (!r.skills.length) { stderr.write(`astra: no hay skills (carpetas con SKILL.md) en ${from}\n`); return 1; }
  if (flags.check) {
    if (r.ok) stdout.write(`OK   ${r.skills.length} skills sincronizadas en ${r.targets.join(', ')}\n`);
    else { for (const s of r.stale) stdout.write(`FAIL desvio: ${s}\n`); stdout.write(`FAIL ${r.stale.length} archivo(s) fuera de sync: correr 'astra skills sync'\n`); }
    return r.ok ? 0 : 1;
  }
  for (const w of r.written) stdout.write(`OK   ${w}\n`);
  stdout.write(`OK   ${r.skills.length} skills · ${r.targets.length} runtime dir(s) · ${r.written.length} archivo(s) escritos\n`);
  return 0;
}

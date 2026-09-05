// commands/standards.mjs — `astra standards search <consulta...> [--family f] [--json]`.
import { searchStandards } from '../standards.mjs';
import { emitJson, usage } from '../cli.mjs';

export async function run({ args, flags, stdout, stderr }) {
  const [sub, ...rest] = args;
  if (sub !== 'search' || !rest.length) return usage(stderr, 'uso: astra standards search <consulta> [--family stellar|evm|syscoin|base|payments|caip] [--limit n]');
  const family = typeof flags.family === 'string' ? flags.family : undefined;
  const limit = flags.limit ? Number(flags.limit) : 10;
  const hits = searchStandards(rest.join(' '), { family, limit });
  if (flags.json) { emitJson(stdout, hits); return hits.length ? 0 : 1; }
  if (!hits.length) { stdout.write('sin resultados\n'); return 1; }
  for (const h of hits) stdout.write(`${h.id.padEnd(12)} ${h.title} (${h.status})\n             ${h.url}\n             ${h.summary}\n`);
  return 0;
}

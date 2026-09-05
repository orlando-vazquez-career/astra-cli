// commands/doctor.mjs — `astra doctor [--chain <id>] [--json]`.
import { doctor } from '../doctor.mjs';
import { emitJson } from '../cli.mjs';

const pad = (s, n) => String(s ?? '').padEnd(n);

export async function run({ flags, stdout, stderr }) {
  const chain = typeof flags.chain === 'string' ? flags.chain : undefined;
  const d = doctor({ chain });
  if (flags.json) { emitJson(stdout, d); return d.chain && (d.chain.error || d.chain.verdict === 'AVOID') ? 1 : 0; }
  stdout.write('Toolchains\n');
  for (const t of d.tools) {
    stdout.write(`  ${t.found ? 'OK ' : '-- '} ${pad(t.name, 18)} ${pad(t.version || '', 34)} ${t.found ? (t.path || '') : t.hint}\n`);
  }
  stdout.write('\nVeredicto por familia\n');
  for (const [fam, v] of Object.entries(d.verdicts)) {
    stdout.write(`  ${pad(v.verdict, 8)} ${fam}\n`);
    for (const r of v.reasons) stdout.write(`           - ${r}\n`);
  }
  if (d.chain) {
    if (d.chain.error) { stderr.write(`astra: ${d.chain.error}: ${d.chain.id}\n`); return 1; }
    stdout.write(`\nCadena ${d.chain.id} (${d.chain.family}/${d.chain.network}): ${d.chain.verdict}\n`);
    return d.chain.verdict === 'AVOID' ? 1 : 0;
  }
  return 0;
}

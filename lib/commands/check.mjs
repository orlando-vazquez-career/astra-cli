// commands/check.mjs — `astra check [--gate mainnet] [--json]`.
import { checkRepo } from '../check.mjs';
import { emitJson, usage } from '../cli.mjs';

export async function run({ flags, stdout, stderr }) {
  const gate = typeof flags.gate === 'string' ? flags.gate : (flags.gate === true ? 'mainnet' : undefined);
  if (gate && gate !== 'mainnet') return usage(stderr, "el unico gate es 'mainnet'");
  const r = checkRepo(process.cwd(), { gate });
  if (flags.json) { emitJson(stdout, r); return r.ok ? 0 : 1; }
  for (const f of r.findings) stdout.write(`${f.severity === 'error' ? 'FAIL' : 'WARN'} ${f.rule}  ${f.file}${f.line ? ':' + f.line : ''}  ${f.hint}\n`);
  if (r.gate) {
    stdout.write(`\nGate de mainnet\n`);
    for (const i of r.gate.items) stdout.write(`  ${i.ok ? 'OK  ' : 'FAIL'} ${i.name.padEnd(20)} ${i.ok ? '' : i.detail}\n`);
  }
  const errores = r.findings.filter(f => f.severity === 'error').length;
  const avisos = r.findings.length - errores;
  stdout.write(`\n${r.ok ? 'OK  ' : 'FAIL'} ${r.scanned} archivos escaneados · ${errores} errores · ${avisos} avisos${r.gate ? ` · gate mainnet ${r.gate.ok ? 'abierto' : 'cerrado'}` : ''}\n`);
  return r.ok ? 0 : 1;
}

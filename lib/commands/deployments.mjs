// commands/deployments.mjs — `astra deployments list | add ...`.
import { readDeployments, addDeployment, KINDS } from '../deployments.mjs';
import { emitJson, usage } from '../cli.mjs';

const pad = (s, n) => String(s ?? '').padEnd(n);
const str = v => (typeof v === 'string' ? v : undefined);

export async function run({ args, flags, stdout, stderr }) {
  const [sub] = args;
  const cwd = process.cwd();
  if (sub === 'list') {
    const reg = readDeployments(cwd);
    if (flags.json) { emitJson(stdout, reg); return 0; }
    if (!reg.deployments.length) { stdout.write('sin despliegues registrados (.astra/deployments.json)\n'); return 0; }
    stdout.write(`${pad('red', 9)}${pad('cadena', 19)}${pad('kind', 10)}${pad('label', 22)}${pad('verificado', 11)}direccion\n`);
    for (const d of reg.deployments) stdout.write(`${pad(d.network, 9)}${pad(d.chain, 19)}${pad(d.kind, 10)}${pad(d.label, 22)}${pad(d.verified ? 'si' : 'no', 11)}${d.address}\n`);
    return 0;
  }
  if (sub === 'add') {
    if (!str(flags.chain) || !str(flags.address)) return usage(stderr, `uso: astra deployments add --chain <id> --address <a> [--kind ${KINDS.join('|')}] [--label <l>] [--tx <t>] [--commit <c>] [--wasm-hash <h>] [--verified] [--verification-url <u>] [--notes <n>] [--force]`);
    const entry = {
      chain: str(flags.chain), address: str(flags.address), kind: str(flags.kind) || 'contract', label: str(flags.label) || str(flags.chain),
      tx: str(flags.tx), commit: str(flags.commit), wasmHash: str(flags['wasm-hash']), verified: flags.verified === true, verificationUrl: str(flags['verification-url']), notes: str(flags.notes), date: str(flags.date),
    };
    const e = addDeployment(cwd, entry, { force: flags.force === true });
    if (flags.json) { emitJson(stdout, e); return 0; }
    stdout.write(`OK   registrado ${e.id}: ${e.chain} ${e.kind} '${e.label}' ${e.address}${e.verified ? ' (verificado)' : ' (sin verificar: A6 antes de anunciar)'}\n`);
    return 0;
  }
  return usage(stderr, 'uso: astra deployments list | add ...');
}

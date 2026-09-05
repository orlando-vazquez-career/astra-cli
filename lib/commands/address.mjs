// commands/address.mjs — `astra address <cadena|familia> <direccion>`.
import { validateAddress } from '../address.mjs';
import { emitJson, usage } from '../cli.mjs';

export async function run({ args, flags, stdout, stderr }) {
  const [target, address] = args;
  if (!target || !address) return usage(stderr, 'uso: astra address <cadena|familia> <direccion>  (ej: astra address base 0x...)');
  const r = validateAddress(target, address);
  if (flags.json) { emitJson(stdout, r); return r.valid ? 0 : 1; }
  if (r.secret) { stdout.write(`FAIL ${r.reason}\n`); return 1; }
  if (!r.valid) { stdout.write(`FAIL ${r.reason}\n`); return 1; }
  const extra = [r.checksum ? `checksum ${r.checksum}` : null, r.ed25519 ? `ed25519 ${r.ed25519} id ${r.muxedId}` : null].filter(Boolean).join(' · ');
  stdout.write(`OK   ${r.family}${r.chain ? '/' + r.chain : ''} ${r.kind} ${r.normalized}${extra ? ' (' + extra + ')' : ''}\n`);
  return 0;
}

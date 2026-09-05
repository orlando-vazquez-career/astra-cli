// commands/chain.mjs — `astra chain list | info <id> | probe <id> [--rpc <url>]`.
import { listChains, getChain } from '../registry.mjs';
import { probeChain } from '../probe.mjs';
import { emitJson, usage } from '../cli.mjs';

const pad = (s, n) => String(s ?? '').padEnd(n);

export async function run({ args, flags, stdout, stderr }) {
  const [sub, id] = args;
  if (sub === 'list') {
    const chains = listChains();
    if (flags.json) { emitJson(stdout, chains); return 0; }
    stdout.write(`${pad('id', 20)}${pad('familia', 9)}${pad('red', 9)}${pad('chainId', 9)}${pad('simbolo', 8)}nombre\n`);
    for (const c of chains) stdout.write(`${pad(c.id, 20)}${pad(c.family, 9)}${pad(c.network, 9)}${pad(c.chainId ?? '-', 9)}${pad(c.nativeSymbol, 8)}${c.name}\n`);
    return 0;
  }
  if (sub === 'info' || sub === 'probe') {
    if (!id) return usage(stderr, `uso: astra chain ${sub} <id> (ver 'astra chain list')`);
    const chain = getChain(id);
    if (!chain) { stderr.write(`astra: cadena desconocida '${id}'. Ver 'astra chain list'.\n`); return 2; }
    if (sub === 'info') {
      if (flags.json) { emitJson(stdout, chain); return 0; }
      for (const [k, v] of Object.entries(chain)) stdout.write(`${pad(k, 16)}${Array.isArray(v) ? (v.length ? v.join(', ') : '-') : (v && typeof v === 'object' ? JSON.stringify(v) : (v ?? '-'))}\n`);
      return 0;
    }
    const r = await probeChain(chain, { rpc: typeof flags.rpc === 'string' ? flags.rpc : undefined });
    if (flags.json) { emitJson(stdout, r); return r.ok ? 0 : 1; }
    stdout.write(`${r.ok ? 'OK  ' : 'FAIL'} ${chain.id} (${chain.family}/${chain.network})${r.endpoint ? ' via ' + r.endpoint : ''} ${r.latencyMs != null ? r.latencyMs + ' ms' : ''}\n`);
    if (r.chainId != null) stdout.write(`     chainId ${r.chainId}${r.expectedChainId != null ? ' (esperado ' + r.expectedChainId + ')' : ''}\n`);
    if (r.blockNumber != null) stdout.write(`     bloque ${r.blockNumber}\n`);
    if (r.ledger != null) stdout.write(`     ledger ${r.ledger}${r.protocolVersion != null ? ' · protocolo ' + r.protocolVersion : ''}\n`);
    if (r.passphrase) stdout.write(`     passphrase "${r.passphrase}"\n`);
    for (const w of r.warnings) stdout.write(`WARN ${w}\n`);
    if (!r.ok) stdout.write(`FAIL ${r.reason}\n`);
    return r.ok ? 0 : 1;
  }
  return usage(stderr, 'uso: astra chain list | info <id> | probe <id> [--rpc <url>]');
}

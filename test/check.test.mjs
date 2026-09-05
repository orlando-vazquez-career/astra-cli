// test/check.test.mjs — escaner de secretos, higiene y gate. Los secretos de prueba se
// construyen en runtime para que el propio escaner no los encuentre en este repo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkRepo, scanFile } from '../lib/check.mjs';
import { encodeStrKey } from '../lib/address.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'astra-check-'));
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });
const seed = () => encodeStrKey(18 << 3, Uint8Array.from({ length: 32 }, (_, i) => i));
const evmKey = () => '0x' + 'a1'.repeat(32);
const SAC = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

test('detecta semilla StrKey, clave EVM con contexto y mnemonico; ignora hashes sin contexto', () => {
  const f = scanFile('x.env', `STELLAR_SECRET=${seed()}\nPRIVATE_KEY=${evmKey()}\nWASM_HASH=${'ab'.repeat(32)}\nMNEMONIC="${Array(12).fill('abandon').join(' ')}"\nNETWORK_PASSPHRASE="Test SDF Network ; September 2015"\n`);
  assert.deepEqual(f.map(x => x.rule).sort(), ['evm-private-key', 'mnemonic', 'stellar-secret-seed']);
  assert.ok(f.every(x => !JSON.stringify(x).includes(seed()) && !JSON.stringify(x).includes('a1a1')));
  assert.deepEqual(scanFile('.env.example', 'PRIVATE_KEY=<tu clave>\nSECRET=your_secret_here\n'), []);
  assert.deepEqual(scanFile('a.md', `SAC=${SAC}\nhash ${'ab'.repeat(32)}\n`), []);
  assert.equal(scanFile('config.ts', "const JWT_SECRET = 'k9f8s7d6f5g4h3j2k1l0zxcvbnm';\n")[0].rule, 'secret-assignment');
});

test('repo limpio pasa; .env versionado y falta de .gitignore fallan', () => {
  const dir = tmp();
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'hola\n');
  assert.equal(checkRepo(dir).ok, true);
  fs.writeFileSync(path.join(dir, '.env.production'), `KEY=${evmKey()}\n`);
  git(dir, 'add', '-f', '.env.production');
  const r = checkRepo(dir);
  assert.equal(r.ok, false);
  assert.ok(r.findings.some(x => x.rule === 'env-tracked'));
  fs.rmSync(path.join(dir, '.gitignore'));
  assert.ok(checkRepo(dir).findings.some(x => x.rule === 'gitignore-env' && x.severity === 'warn'));
});

test('material de claves versionado y registro invalido son errores; sin git tambien escanea', () => {
  const dir = tmp();
  git(dir, 'init', '-q');
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');
  fs.mkdirSync(path.join(dir, '.stellar', 'identity'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.stellar', 'identity', 'alice.toml'), 'seed_phrase = "..."\n');
  git(dir, 'add', '-f', '.stellar/identity/alice.toml');
  assert.ok(checkRepo(dir).findings.some(x => x.rule === 'key-material-tracked'));
  fs.mkdirSync(path.join(dir, '.astra'));
  fs.writeFileSync(path.join(dir, '.astra', 'deployments.json'), '{"version":1,"deployments":[{"chain":"base","kind":"contract","label":"x","address":"nope"}]}');
  assert.ok(checkRepo(dir).findings.some(x => x.rule === 'deployments-invalid'));
  const plain = tmp();
  fs.writeFileSync(path.join(plain, 'notas.txt'), `mnemonic: ${Array(24).fill('zoo').join(' ')}\n`);
  assert.ok(checkRepo(plain).findings.some(x => x.rule === 'mnemonic'));
});

test('gate mainnet exige carta aprobada, testnet, auditoria apta y launch firmado', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '.gitignore'), '.env\n');
  let g = checkRepo(dir, { gate: 'mainnet' }).gate;
  assert.equal(g.ok, false);
  assert.equal(g.items.filter(i => i.ok).length, 1, 'solo sin-secretos pasa en un repo vacio');
  fs.mkdirSync(path.join(dir, 'docs', 'astra'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.astra'));
  fs.writeFileSync(path.join(dir, 'docs', 'astra', 'chart.md'), '# Carta\naprobada: 2026-09-04\n');
  fs.writeFileSync(path.join(dir, '.astra', 'deployments.json'), JSON.stringify({ version: 1, deployments: [{ id: 'dpl_1', chain: 'stellar-testnet', family: 'stellar', network: 'testnet', kind: 'contract', label: 'x', address: SAC, date: '2026-09-04', verified: false }] }));
  fs.writeFileSync(path.join(dir, 'docs', 'astra', 'audit.md'), '# Auditoria\nveredicto: apto\n| ID | Severidad | Estado | Hallazgo |\n|---|---|---|---|\n| A-1 | alta | cerrada | x |\n');
  fs.writeFileSync(path.join(dir, 'docs', 'astra', 'launch.md'), '# Launch\nfirmado_por: Operador\nfecha_firma: 2026-09-04\ncosto_estimado: 12 XLM\n');
  const full = checkRepo(dir, { gate: 'mainnet' });
  assert.equal(full.gate.ok, true, JSON.stringify(full.gate));
  assert.equal(full.ok, true);
  fs.writeFileSync(path.join(dir, 'docs', 'astra', 'audit.md'), '# Auditoria\nveredicto: apto\n| ID | Severidad | Estado | Hallazgo |\n|---|---|---|---|\n| A-1 | critica | abierta | x |\n');
  assert.equal(checkRepo(dir, { gate: 'mainnet' }).gate.ok, false);
  fs.writeFileSync(path.join(dir, 'docs', 'astra', 'audit.md'), '# Auditoria\nveredicto: apto\n');
  fs.writeFileSync(path.join(dir, 'docs', 'astra', 'launch.md'), '# Launch\nfirmado_por: <nombre>\nfecha_firma: 2026-09-04\ncosto_estimado: 12 XLM\n');
  assert.equal(checkRepo(dir, { gate: 'mainnet' }).gate.items.find(i => i.name === 'launch-firmado').ok, false);
});

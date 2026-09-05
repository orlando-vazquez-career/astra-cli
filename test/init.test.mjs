// test/init.test.mjs — scaffolding idempotente.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initProject, upsertBlock, BLOCK_START, BLOCK_END } from '../lib/init.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'astra-init-'));

function fakeProtocol() {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'skills', 'astra'), { recursive: true });
  for (const t of ['orbit', 'chart', 'audit', 'launch']) fs.writeFileSync(path.join(dir, 'templates', `${t}.template.md`), `# ${t}\n`);
  fs.writeFileSync(path.join(dir, 'skills', 'astra', 'SKILL.md'), '---\nname: astra\ndescription: entrada\n---\nhola\n');
  fs.writeFileSync(path.join(dir, 'ASTRA-PROTOCOL.md'), '# ASTRA\n');
  return dir;
}

test('upsertBlock agrega y luego reemplaza sin duplicar', () => {
  const a = upsertBlock('# Repo\n', `${BLOCK_START}\nv1\n${BLOCK_END}`);
  const b = upsertBlock(a, `${BLOCK_START}\nv2\n${BLOCK_END}`);
  assert.equal(b.split(BLOCK_START).length, 2);
  assert.match(b, /v2/);
  assert.doesNotMatch(b, /v1/);
  assert.ok(b.startsWith('# Repo\n'));
});

test('init crea estado, docs, gitignore, bloques y skills; es idempotente', () => {
  const cwd = tmp();
  const protocolDir = fakeProtocol();
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), '# Mi repo\n');
  const r = initProject({ cwd, chains: ['stellar-testnet'], runtimes: ['claude', 'codex'], protocolDir, today: '2026-09-04' });
  for (const f of ['.astra/astra.json', '.astra/deployments.json', 'docs/astra/orbit.md', 'docs/astra/chart.md', 'docs/astra/audit.md', 'docs/astra/launch.md', 'docs/astra/devlogs/.gitkeep', '.gitignore', 'CLAUDE.md', 'GEMINI.md', '.claude/skills/astra/SKILL.md', '.agents/skills/astra/SKILL.md']) {
    assert.ok(fs.existsSync(path.join(cwd, f)), f);
  }
  assert.ok(r.updated.includes('AGENTS.md'));
  assert.equal(r.warnings.length, 0);
  assert.match(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8'), /# Mi repo[\s\S]*astra:start[\s\S]*stellar-testnet/);
  assert.match(fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8'), /^\.env$/m);
  assert.equal(fs.readFileSync(path.join(cwd, 'docs', 'astra', 'chart.md'), 'utf8'), '# chart\n');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cwd, '.astra', 'astra.json'), 'utf8')).chains, ['stellar-testnet']);
  const r2 = initProject({ cwd, chains: ['stellar-testnet'], runtimes: ['claude', 'codex'], protocolDir, today: '2026-09-04' });
  assert.equal(r2.created.length, 0, JSON.stringify(r2));
  assert.equal(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8').split('astra:start').length, 2);
  const r3 = initProject({ cwd, chains: ['base-sepolia'], runtimes: ['claude'], protocolDir, today: '2026-09-05' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cwd, '.astra', 'astra.json'), 'utf8')).chains, ['stellar-testnet', 'base-sepolia']);
  assert.ok(r3.updated.includes('.astra/astra.json'));
});

test('sin protocolo resoluble avisa y crea igual el estado minimo', () => {
  const cwd = tmp();
  const r = initProject({ cwd, chains: [], runtimes: ['claude'], protocolDir: null, today: '2026-09-04' });
  assert.ok(r.warnings.some(w => /astra protocol fetch/.test(w)));
  assert.ok(fs.existsSync(path.join(cwd, '.astra', 'deployments.json')));
  assert.ok(fs.existsSync(path.join(cwd, 'docs', 'astra', 'orbit.md')));
});

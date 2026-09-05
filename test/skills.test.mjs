// test/skills.test.mjs — sync de skills a los directorios de cada runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncSkills, expandRuntimes, renderGenerated } from '../lib/skills.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'astra-skills-'));

function fakeProtocol() {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'skills', 'astra-orbit', 'refs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'skills', 'astra-orbit', 'SKILL.md'), '---\nname: astra-orbit\ndescription: fase 1\n---\n\nCuerpo.\n');
  fs.writeFileSync(path.join(dir, 'skills', 'astra-orbit', 'refs', 'notas.md'), 'extra\n');
  fs.mkdirSync(path.join(dir, 'skills', 'sin-skill'));
  return dir;
}

test('expandRuntimes deduplica directorios, entiende all y rechaza desconocidos', () => {
  assert.deepEqual(expandRuntimes('codex,antigravity,claude'), ['.agents/skills', '.claude/skills']);
  assert.equal(expandRuntimes('all').length, 4);
  assert.throws(() => expandRuntimes('vim'), /runtime desconocido/);
});

test('sync copia con cabecera de generado y --check detecta desvio', () => {
  const from = path.join(fakeProtocol(), 'skills');
  const to = tmp();
  const r = syncSkills({ from, to, runtimes: ['claude', 'codex'] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.skills, ['astra-orbit']);
  assert.equal(r.written.length, 4);
  const copy = fs.readFileSync(path.join(to, '.claude', 'skills', 'astra-orbit', 'SKILL.md'), 'utf8');
  assert.ok(copy.startsWith('---\nname: astra-orbit'));
  assert.match(copy, /GENERADO por astra skills sync/);
  assert.match(copy, /Cuerpo\./);
  assert.equal(syncSkills({ from, to, runtimes: ['claude', 'codex'], check: true }).ok, true);
  assert.equal(syncSkills({ from, to, runtimes: ['claude', 'codex'] }).written.length, 0, 'idempotente');
  fs.writeFileSync(path.join(to, '.agents', 'skills', 'astra-orbit', 'SKILL.md'), 'editado a mano');
  const c = syncSkills({ from, to, runtimes: ['claude', 'codex'], check: true });
  assert.equal(c.ok, false);
  assert.equal(c.stale.length, 1);
});

test('renderGenerated sin frontmatter pone la cabecera al inicio', () => {
  assert.ok(renderGenerated('hola\n', 'x/SKILL.md').startsWith('<!-- GENERADO'));
});

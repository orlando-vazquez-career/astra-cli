// test/util.test.mjs — utilidades base: busqueda de ejecutables, escritura atomica, fechas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findExecutable, runVersion, writeAtomic, readJson, fechaLocalISO, isWindows } from '../lib/util.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'astra-util-'));

test('findExecutable respeta PATH y PATHEXT', () => {
  const dir = tmp();
  const name = isWindows ? 'fakestellar.cmd' : 'fakestellar';
  fs.writeFileSync(path.join(dir, name), isWindows ? '@echo off\r\necho fakestellar 9.9.9\r\n' : '#!/bin/sh\necho "fakestellar 9.9.9"\n', { mode: 0o755 });
  const env = { PATH: dir, PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  assert.equal(findExecutable('fakestellar', env), path.join(dir, name));
  assert.equal(findExecutable('no-existe-seguro', env), null);
  assert.equal(runVersion(path.join(dir, name)), 'fakestellar 9.9.9');
});

test('writeAtomic escribe completo y readJson lee con fallback', () => {
  const dir = tmp();
  const f = path.join(dir, 'a', 'b.json');
  writeAtomic(f, JSON.stringify({ ok: 1 }));
  assert.deepEqual(readJson(f), { ok: 1 });
  assert.deepEqual(readJson(path.join(dir, 'nope.json'), { d: true }), { d: true });
  assert.equal(fs.readdirSync(path.dirname(f)).filter(n => n.endsWith('.tmp')).length, 0);
});

test('fechaLocalISO usa el calendario local', () => {
  assert.equal(fechaLocalISO(new Date(2026, 8, 4, 23, 59)), '2026-09-04');
});

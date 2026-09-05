// test/keccak.test.mjs — vectores publicos de Keccak-256.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256Hex } from '../lib/keccak.mjs';

test('keccak256 de cadena vacia', () => {
  assert.equal(keccak256Hex(''), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
});

test('keccak256 de 200 bytes (dos bloques) es determinista y de 64 hex', () => {
  const h = keccak256Hex('a'.repeat(200));
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, keccak256Hex(new TextEncoder().encode('a'.repeat(200))));
  assert.notEqual(h, keccak256Hex('a'.repeat(201)));
});

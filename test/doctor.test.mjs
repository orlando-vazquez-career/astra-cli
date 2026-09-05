// test/doctor.test.mjs — veredictos con un PATH simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTools, verdictFor, doctor } from '../lib/doctor.mjs';

const fake = present => ({
  findExec: name => (present.includes(name) ? `/fake/${name}` : null),
  runVer: p => `${p.split('/').pop()} 1.0.0`,
  env: { PATH: '' },
  cwd: '/nowhere',
});

test('con stellar y cargo la familia stellar es SAFE; con uno CAUTION; sin ninguno AVOID', () => {
  assert.equal(verdictFor('stellar', detectTools(fake(['node', 'git', 'stellar', 'cargo']))).verdict, 'SAFE');
  assert.equal(verdictFor('stellar', detectTools(fake(['node', 'git', 'stellar']))).verdict, 'CAUTION');
  assert.equal(verdictFor('stellar', detectTools(fake(['node', 'git', 'cargo']))).verdict, 'CAUTION');
  assert.equal(verdictFor('stellar', detectTools(fake(['node', 'git']))).verdict, 'AVOID');
});

test('evm: forge → SAFE; solo node → CAUTION con razon', () => {
  assert.equal(verdictFor('evm', detectTools(fake(['node', 'git', 'forge']))).verdict, 'SAFE');
  const v = verdictFor('evm', detectTools(fake(['node', 'git'])));
  assert.equal(v.verdict, 'CAUTION');
  assert.ok(v.reasons.some(r => /forge|hardhat/i.test(r)));
});

test('utxo: syscoin-cli → SAFE; sin el → AVOID', () => {
  assert.equal(verdictFor('utxo', detectTools(fake(['syscoin-cli']))).verdict, 'SAFE');
  assert.equal(verdictFor('utxo', detectTools(fake([]))).verdict, 'AVOID');
});

test('doctor devuelve las tres familias y filtra por cadena', () => {
  const d = doctor({ ...fake(['node', 'git', 'forge']), chain: 'base' });
  assert.deepEqual(Object.keys(d.verdicts).sort(), ['evm', 'stellar', 'utxo']);
  assert.equal(d.chain.id, 'base');
  assert.equal(d.chain.verdict, 'SAFE');
  assert.ok(d.tools.find(t => t.name === 'forge').version.startsWith('forge'));
  assert.equal(doctor({ ...fake([]), chain: 'marte' }).chain.error, 'cadena desconocida');
});

// test/address.test.mjs — vectores oficiales: SEP-0023, EIP-55, BIP-173/350, base58check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeStrKey, encodeStrKey, validateEvmAddress, decodeSegwit, base58checkDecode, validateAddress } from '../lib/address.mjs';
import { toHex } from '../lib/keccak.mjs';

const G = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';

test('StrKey acepta los casos validos de SEP-0023 y las SAC reales', () => {
  const casos = [
    [G, 'ed25519_public_key'],
    ['MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUQ', 'muxed_account'],
    ['MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK', 'muxed_account'],
    ['CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA', 'contract'],
    ['LA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUPJN', 'liquidity_pool'],
    ['BAAD6DBUX6J22DMZOHIEZTEQ64CVCHEDRKWZONFEUL5Q26QD7R76RGR4TU', 'claimable_balance'],
    ['PA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAQACAQDAQCQMBYIBEFAWDANBYHRAEISCMKBKFQXDAMRUGY4DUPB6IBZGM', 'signed_payload'],
    ['PA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAOQCAQDAQCQMBYIBEFAWDANBYHRAEISCMKBKFQXDAMRUGY4DUAAAAFGBU', 'signed_payload'],
    ['CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', 'contract'],
    ['CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA', 'contract'],
  ];
  for (const [s, kind] of casos) {
    const r = decodeStrKey(s);
    assert.equal(r.valid, true, `${s}: ${r.reason}`);
    assert.equal(r.kind, kind, s);
  }
  const m = decodeStrKey('MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK');
  assert.equal(m.ed25519, G);
  assert.equal(m.id, 9223372036854775808n);
  assert.equal(decodeStrKey('MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUQ').id, 0n);
});

test('StrKey rechaza los casos invalidos de SEP-0023', () => {
  const invalidos = [
    'GAAAAAAAACGC6',
    'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUR',
    'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZA',
    'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUACUSI',
    'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLKA',
    'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAAV75I',
    'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUK===',
    'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUO',
    '', 'ga7qynf7', 'G',
  ];
  for (const s of invalidos) assert.equal(decodeStrKey(s).valid, false, s);
});

test('una semilla secreta se detecta y nunca se devuelve normalizada', () => {
  const seed = encodeStrKey(18 << 3, new Uint8Array(32));
  assert.equal(seed[0], 'S');
  assert.equal(decodeStrKey(seed).secret, true);
  const r = validateAddress('stellar', seed);
  assert.equal(r.valid, false);
  assert.equal(r.secret, true);
  assert.ok(!('normalized' in r));
  assert.ok(!JSON.stringify(r).includes(seed));
});

test('EIP-55', () => {
  for (const a of ['0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB', '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb']) {
    const r = validateEvmAddress(a);
    assert.equal(r.valid, true, a);
    assert.equal(r.checksum, 'ok');
    assert.equal(r.normalized, a);
  }
  assert.equal(validateEvmAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD').valid, false);
  const upper = validateEvmAddress('0x52908400098527886E0F7030069857D2E4169EE7');
  assert.equal(upper.valid, true);
  assert.equal(upper.checksum, 'none');
  const lower = validateEvmAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
  assert.equal(lower.normalized, '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  assert.equal(validateEvmAddress('0x1234').valid, false);
});

test('bech32 y bech32m (BIP-173/350)', () => {
  const v0 = decodeSegwit(['bc'], 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  assert.equal(v0.version, 0);
  assert.equal(toHex(v0.program), '751e76e8199196d454941c45d1b3a323f1433bd6');
  const v0u = decodeSegwit(['bc'], 'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4');
  assert.equal(v0u.version, 0);
  const v1 = decodeSegwit(['bc'], 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0');
  assert.equal(v1.version, 1);
  assert.equal(toHex(v1.program), '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
  const malos = [
    'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5',
    'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
    'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh',
    'tb1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vq47Zagq',
    'BC1QR508D6QEJXTDG4Y5R3ZARVARYV98GJ9P',
    'bc1pw5dgrnzv',
  ];
  for (const bad of malos) assert.ok(decodeSegwit(['bc', 'tb'], bad).error, bad);
  assert.ok(decodeSegwit(['sys'], 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4').error, 'hrp ajeno');
});

test('base58check', () => {
  assert.equal(base58checkDecode('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2').version, 0);
  assert.equal(base58checkDecode('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2').hash.length, 20);
  assert.equal(base58checkDecode('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy').version, 5);
  assert.equal(base58checkDecode('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN3'), null);
  assert.equal(base58checkDecode('0OIl'), null);
});

test('validateAddress por familia y por cadena', () => {
  assert.equal(validateAddress('stellar-testnet', 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC').kind, 'contract');
  assert.equal(validateAddress('stellar', G).valid, true);
  const b = validateAddress('base', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  assert.equal(b.valid, true);
  assert.equal(b.chain, 'base');
  const pk = validateAddress('evm', '0x' + 'ab'.repeat(32));
  assert.equal(pk.valid, false);
  assert.equal(pk.secret, true);
  assert.equal(validateAddress('syscoin-utxo', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4').valid, false, 'hrp bc no es sys');
  assert.equal(validateAddress('syscoin-utxo', '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2').valid, false, 'version 0 no es de syscoin');
  assert.equal(validateAddress('syscoin-utxo', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy').kind, 'p2sh');
  assert.equal(validateAddress('marte', 'x').valid, false);
  assert.equal(validateAddress('evm', '').valid, false);
});

// address.mjs — validacion de direcciones por familia, sin red y sin claves.
//
//   stellar: StrKey (SEP-0023): base32 sin padding, byte de version, CRC16-XModem,
//            representacion canonica. Tipos G (cuenta), M (cuenta multiplexada), C
//            (contrato), L (pool de liquidez), B (claimable balance), P (payload firmado),
//            T (pre-auth tx), X (hash sha256) y S (semilla SECRETA: se detecta, nunca se
//            devuelve normalizada).
//   evm:     0x + 40 hex con checksum EIP-55 (keccak-256 propio). Un hex de 64 se trata
//            como clave privada y se rechaza como secreto.
//   utxo:    bech32 / bech32m segwit (BIP-173 / BIP-350) con HRP de la red (sys / tsys) y
//            base58check para direcciones legacy; un WIF (version 128/239) es secreto.
//
// Contrato de validateAddress(target, address):
//   { valid, family, chain?, kind?, normalized?, checksum?, secret: boolean, reason? }
//   Cuando secret === true NUNCA hay `normalized` ni la direccion original en el resultado.
import { createHash } from 'node:crypto';
import { keccak256Hex } from './keccak.mjs';
import { resolveFamily } from './registry.mjs';

// ───────────────────────────── base32 (RFC 4648, sin padding) ─────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(s) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) return null;
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return { bytes: Uint8Array.from(out), leftoverBits: bits, leftover: value & ((1 << bits) - 1) };
}

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// ───────────────────────────── StrKey (SEP-0023) ─────────────────────────────
function crc16xmodem(bytes) {
  let crc = 0;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc;
}

export const STRKEY_VERSIONS = {
  G: { byte: 6 << 3, kind: 'ed25519_public_key', len: [32] },
  S: { byte: 18 << 3, kind: 'ed25519_secret_seed', len: [32], secret: true },
  M: { byte: 12 << 3, kind: 'muxed_account', len: [40] },
  T: { byte: 19 << 3, kind: 'pre_auth_tx', len: [32] },
  X: { byte: 23 << 3, kind: 'sha256_hash', len: [32] },
  P: { byte: 15 << 3, kind: 'signed_payload', len: null },
  C: { byte: 2 << 3, kind: 'contract', len: [32] },
  L: { byte: 11 << 3, kind: 'liquidity_pool', len: [32] },
  B: { byte: 1 << 3, kind: 'claimable_balance', len: [33] },
};

export function encodeStrKey(versionByte, payload) {
  const body = new Uint8Array(1 + payload.length + 2);
  body[0] = versionByte;
  body.set(payload, 1);
  const crc = crc16xmodem(body.subarray(0, 1 + payload.length));
  body[body.length - 2] = crc & 0xff;
  body[body.length - 1] = (crc >> 8) & 0xff;
  return base32Encode(body);
}

function readUInt32BE(bytes, off) {
  return ((bytes[off] << 24) >>> 0) + (bytes[off + 1] << 16) + (bytes[off + 2] << 8) + bytes[off + 3];
}

export function decodeStrKey(s) {
  if (typeof s !== 'string' || s.length === 0) return { valid: false, reason: 'vacio' };
  if (!/^[A-Z2-7]+$/.test(s)) return { valid: false, reason: 'caracteres fuera del alfabeto base32 (solo A-Z y 2-7, sin padding)' };
  const mod = s.length % 8;
  if (mod === 1 || mod === 3 || mod === 6) return { valid: false, reason: 'longitud invalida para base32' };
  const dec = base32Decode(s);
  if (!dec) return { valid: false, reason: 'base32 invalido' };
  if (dec.leftover !== 0) return { valid: false, reason: 'bits de relleno no nulos (representacion no canonica)' };
  const bytes = dec.bytes;
  if (bytes.length < 3 + 1) return { valid: false, reason: 'demasiado corto' };
  const version = bytes[0];
  const entry = Object.entries(STRKEY_VERSIONS).find(([, v]) => v.byte === version);
  if (!entry) return { valid: false, reason: `byte de version desconocido (${version})` };
  const [prefix, meta] = entry;
  const payload = bytes.subarray(1, bytes.length - 2);
  const checksum = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
  if (crc16xmodem(bytes.subarray(0, bytes.length - 2)) !== checksum) return { valid: false, reason: 'checksum invalido' };
  if (meta.len && !meta.len.includes(payload.length)) return { valid: false, reason: `payload de ${payload.length} bytes invalido para el tipo ${prefix}` };
  if (prefix === 'P') {
    if (payload.length < 32 + 4 + 4 || payload.length > 32 + 4 + 64) return { valid: false, reason: 'longitud de payload firmado fuera de rango' };
    const plen = readUInt32BE(payload, 32);
    const padded = Math.ceil(plen / 4) * 4;
    if (plen < 1 || plen > 64 || 32 + 4 + padded !== payload.length) return { valid: false, reason: 'longitud declarada del payload inconsistente' };
    for (let i = 36 + plen; i < payload.length; i++) if (payload[i] !== 0) return { valid: false, reason: 'relleno del payload no nulo' };
  }
  if (prefix === 'B' && payload[0] !== 0) return { valid: false, reason: 'tipo de claimable balance no soportado' };
  if (encodeStrKey(version, payload) !== s) return { valid: false, reason: 'representacion no canonica' };
  const out = { valid: true, prefix, kind: meta.kind, payload, secret: !!meta.secret };
  if (prefix === 'M') {
    out.ed25519 = encodeStrKey(STRKEY_VERSIONS.G.byte, payload.subarray(0, 32));
    let id = 0n;
    for (let i = 32; i < 40; i++) id = (id << 8n) | BigInt(payload[i]);
    out.id = id;
  }
  return out;
}

// ───────────────────────────── EVM (EIP-55) ─────────────────────────────
export function validateEvmAddress(addr) {
  if (typeof addr !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(addr)) return { valid: false, reason: 'formato: 0x seguido de 40 hex' };
  const hex = addr.slice(2);
  const lower = hex.toLowerCase();
  const hash = keccak256Hex(lower);
  let checksummed = '0x';
  for (let i = 0; i < 40; i++) {
    const c = lower[i];
    checksummed += /[a-f]/.test(c) && parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c;
  }
  const mixed = hex !== lower && hex !== hex.toUpperCase();
  if (mixed && checksummed !== addr) return { valid: false, reason: 'checksum EIP-55 invalido: la direccion tiene mayusculas que no corresponden (posible error de tipeo)' };
  return { valid: true, kind: 'account_or_contract', checksum: mixed ? 'ok' : 'none', normalized: checksummed };
}

// ───────────────────────────── bech32 / bech32m (BIP-173 / BIP-350) ─────────────────────────────
const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32_GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32M_CONST = 0x2bc830a3;

function bech32Polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = (((chk & 0x1ffffff) << 5) ^ v) >>> 0;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk = (chk ^ BECH32_GEN[i]) >>> 0;
  }
  return chk >>> 0;
}

function hrpExpand(hrp) {
  const out = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >>> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

export function bech32Decode(str) {
  if (typeof str !== 'string' || str.length < 8 || str.length > 90) return { error: 'longitud fuera de rango' };
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) return { error: 'mayusculas y minusculas mezcladas' };
  const s = str.toLowerCase();
  for (const c of s) { const code = c.charCodeAt(0); if (code < 33 || code > 126) return { error: 'caracter fuera de rango' }; }
  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length) return { error: 'separador 1 mal ubicado' };
  const hrp = s.slice(0, pos);
  const data = [];
  for (const c of s.slice(pos + 1)) {
    const v = BECH32_CHARSET.indexOf(c);
    if (v < 0) return { error: `caracter invalido '${c}'` };
    data.push(v);
  }
  const pm = bech32Polymod([...hrpExpand(hrp), ...data]);
  const encoding = pm === 1 ? 'bech32' : pm === BECH32M_CONST ? 'bech32m' : null;
  if (!encoding) return { error: 'checksum invalido' };
  return { hrp, data: data.slice(0, -6), encoding };
}

function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    if (v < 0 || v >> from) return null;
    acc = ((acc << from) | v) & 0xffffff;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    return null;
  }
  return out;
}

export function decodeSegwit(expectedHrps, addr) {
  const dec = bech32Decode(addr);
  if (dec.error) return dec;
  if (!expectedHrps.includes(dec.hrp)) return { error: `prefijo '${dec.hrp}' no corresponde a esta red (${expectedHrps.join('/')})` };
  if (!dec.data.length) return { error: 'sin datos' };
  const version = dec.data[0];
  if (version > 16) return { error: 'version de testigo invalida' };
  const program = convertBits(dec.data.slice(1), 5, 8, false);
  if (!program || program.length < 2 || program.length > 40) return { error: 'longitud de programa invalida' };
  if (version === 0 && program.length !== 20 && program.length !== 32) return { error: 'longitud de programa invalida para version 0' };
  if (version === 0 && dec.encoding !== 'bech32') return { error: 'version 0 exige bech32 (no bech32m)' };
  if (version !== 0 && dec.encoding !== 'bech32m') return { error: 'version >= 1 exige bech32m' };
  return { hrp: dec.hrp, version, program: Uint8Array.from(program), encoding: dec.encoding };
}

// ───────────────────────────── base58check ─────────────────────────────
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const sha256 = b => createHash('sha256').update(b).digest();

export function base58Decode(s) {
  if (typeof s !== 'string' || !s.length) return null;
  let n = 0n;
  for (const c of s) {
    const v = B58.indexOf(c);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c === '1') bytes.unshift(0); else break; }
  return Uint8Array.from(bytes);
}

export function base58checkDecode(s) {
  const b = base58Decode(s);
  if (!b || b.length < 5) return null;
  const payload = b.subarray(0, b.length - 4);
  const chk = b.subarray(b.length - 4);
  const h = sha256(sha256(payload));
  for (let i = 0; i < 4; i++) if (h[i] !== chk[i]) return null;
  return { version: payload[0], hash: payload.subarray(1) };
}

// ───────────────────────────── fachada por familia ─────────────────────────────
const SECRET = reason => ({ valid: false, secret: true, reason: `${reason}: no se imprime, no se registra, no se pega en un chat. Si un agente la vio, rotarla.` });

function validateStellar(address) {
  const r = decodeStrKey(String(address).trim());
  if (!r.valid) return { valid: false, secret: false, reason: r.reason };
  if (r.secret) return SECRET('semilla secreta StrKey (S...) detectada');
  const out = { valid: true, secret: false, kind: r.kind, normalized: String(address).trim() };
  if (r.ed25519) { out.ed25519 = r.ed25519; out.muxedId = r.id.toString(); }
  return out;
}

function validateEvm(address) {
  const a = String(address).trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(a)) return SECRET('parece una clave privada EVM (64 hex)');
  const r = validateEvmAddress(a);
  return r.valid ? { valid: true, secret: false, kind: r.kind, checksum: r.checksum, normalized: r.normalized } : { valid: false, secret: false, reason: r.reason };
}

function validateUtxo(chain, address) {
  const a = String(address).trim();
  const hrp = chain?.addressHrp || 'sys';
  const thrp = chain?.testnetHrp || 'tsys';
  const hrps = chain ? (chain.network === 'testnet' ? [thrp] : [hrp]) : [hrp, thrp];
  const versions = chain?.base58Versions || { p2pkh: 63, p2sh: 5, testnetP2pkh: 65, testnetP2sh: 196 };
  if (/^[a-z0-9]+1[a-z0-9]+$/i.test(a) && a.toLowerCase().startsWith(hrp + '1') || a.toLowerCase().startsWith(thrp + '1')) {
    const seg = decodeSegwit(hrps, a);
    if (seg.error) return { valid: false, secret: false, reason: seg.error };
    return { valid: true, secret: false, kind: seg.version === 0 ? (seg.program.length === 20 ? 'p2wpkh' : 'p2wsh') : `segwit_v${seg.version}`, normalized: a.toLowerCase() };
  }
  const b58 = base58checkDecode(a);
  if (!b58) return { valid: false, secret: false, reason: 'no es bech32 de esta red ni base58check valido' };
  if (b58.version === 128 || b58.version === 239) return SECRET('clave privada WIF detectada');
  const kinds = { [versions.p2pkh]: 'p2pkh', [versions.p2sh]: 'p2sh', [versions.testnetP2pkh]: 'p2pkh_testnet', [versions.testnetP2sh]: 'p2sh_testnet' };
  if (!(b58.version in kinds) || b58.hash.length !== 20) return { valid: false, secret: false, reason: `byte de version ${b58.version} no corresponde a esta cadena` };
  return { valid: true, secret: false, kind: kinds[b58.version], normalized: a };
}

export function validateAddress(target, address) {
  const resolved = resolveFamily(target);
  if (!resolved) return { valid: false, secret: false, reason: `'${target}' no es una cadena del registro ni una familia (stellar, evm, utxo)` };
  const { family, chain } = resolved;
  const base = { family, chain: chain ? chain.id : null };
  if (address === undefined || address === null || String(address).trim() === '') return { ...base, valid: false, secret: false, reason: 'direccion vacia' };
  const r = family === 'stellar' ? validateStellar(address) : family === 'evm' ? validateEvm(address) : validateUtxo(chain, address);
  return { ...base, ...r };
}

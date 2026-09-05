// registry.mjs — registro de cadenas (data/chains.json). Solo lectura.
//
// Una cadena se identifica por `id` (ej: 'base', 'stellar-testnet') y pertenece a una
// `family` ('stellar' | 'evm' | 'utxo') que decide como se validan direcciones, como se
// sondea la red y que toolchain hace falta. Agregar una cadena = una entrada nueva en el
// JSON con `verifiedAt` (fecha en que se probaron sus URLs en vivo) + una guia en el
// protocolo. Nada de este modulo llama a la red.
import { fileURLToPath } from 'node:url';
import { readJson } from './util.mjs';

export const FAMILIES = ['stellar', 'evm', 'utxo'];

let cache = null;

export function loadChains() {
  if (!cache) cache = readJson(fileURLToPath(new URL('../data/chains.json', import.meta.url)));
  return cache;
}

export function listChains() {
  return loadChains().chains;
}

export function getChain(id) {
  return listChains().find(c => c.id === id) || null;
}

// Acepta un id de cadena o el nombre de una familia. null si no es ninguna de las dos.
export function resolveFamily(idOrFamily) {
  if (FAMILIES.includes(idOrFamily)) return { family: idOrFamily, chain: null };
  const chain = getChain(idOrFamily);
  return chain ? { family: chain.family, chain } : null;
}

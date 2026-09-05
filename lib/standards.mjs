// standards.mjs — catalogo de estandares (data/standards.json) y busqueda local.
//
// El catalogo es un mapa de ruteo, no la fuente de verdad del estado de cada estandar:
// titulo y estado se copiaron de la fuente oficial en la fecha `verifiedAt` y pueden
// cambiar. Antes de implementar, el agente confirma el estado en la URL.
import { fileURLToPath } from 'node:url';
import { readJson, normalizeText } from './util.mjs';

let cache = null;

export function loadStandards() {
  if (!cache) cache = readJson(fileURLToPath(new URL('../data/standards.json', import.meta.url)));
  return cache.standards;
}

export function searchStandards(query, { family, limit = 10 } = {}) {
  const tokens = normalizeText(query).split(/[^a-z0-9]+/).filter(t => t.length >= 2);
  if (!tokens.length) return [];
  const scored = [];
  for (const s of loadStandards()) {
    if (family && s.family !== family) continue;
    const id = normalizeText(s.id);
    const title = normalizeText(s.title);
    const tags = s.tags.map(normalizeText);
    const summary = normalizeText(s.summary || '');
    let score = 0;
    for (const t of tokens) {
      if (id === t || id.replace('-', '') === t) score += 5;
      else if (id.includes(t)) score += 3;
      if (title.includes(t)) score += 2;
      if (tags.some(tag => tag === t)) score += 3;
      else if (tags.some(tag => tag.includes(t))) score += 2;
      if (summary.includes(t)) score += 1;
    }
    if (score > 0) scored.push({ ...s, score });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit);
}

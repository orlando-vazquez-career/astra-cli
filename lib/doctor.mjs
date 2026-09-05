// doctor.mjs — deteccion de toolchains y veredicto de capacidad por familia de cadena.
//
// El veredicto es la respuesta de la fase Orbita a "¿podemos construir en esta cadena
// desde esta maquina?":
//   SAFE    = toolchain completo para construir, testear y desplegar.
//   CAUTION = se puede avanzar con limitaciones (falta el compilador o el CLI).
//   AVOID   = no hay con que trabajar: instalar antes de planificar.
// No instala nada, no llama a la red. `findExec` y `runVer` se inyectan para los tests.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { findExecutable, runVersion, isWindows } from './util.mjs';
import { getChain, FAMILIES } from './registry.mjs';

export const TOOLS = [
  { name: 'node', families: ['*'], role: 'runtime (>= 20)', hint: 'https://nodejs.org' },
  { name: 'git', families: ['*'], role: 'control de versiones', hint: 'https://git-scm.com' },
  { name: 'stellar', families: ['stellar'], role: 'Stellar CLI: build, deploy, invoke, keys', hint: 'cargo install --locked stellar-cli' },
  { name: 'cargo', families: ['stellar'], role: 'compilar contratos Soroban (Rust)', hint: 'https://rustup.rs' },
  { name: 'rustup', families: ['stellar'], role: 'targets wasm32', hint: 'https://rustup.rs' },
  { name: 'forge', families: ['evm'], role: 'Foundry: compilar, testear, desplegar, verificar', hint: 'https://getfoundry.sh' },
  { name: 'cast', families: ['evm'], role: 'Foundry: RPC, wallets con alias, utilidades', hint: 'https://getfoundry.sh' },
  { name: 'anvil', families: ['evm'], role: 'Foundry: nodo local', hint: 'https://getfoundry.sh' },
  { name: 'syscoin-cli', families: ['utxo'], role: 'nodo Syscoin L1 (UTXO)', hint: 'https://docs.syscoin.org' },
  { name: 'docker', families: ['*'], role: 'opcional: nodos locales y quickstart', hint: 'https://docs.docker.com' },
];

function wasmTargetInstalled(rustupPath) {
  const r = spawnSync(rustupPath, ['target', 'list', '--installed'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (r.status !== 0) return null;
  return /wasm32v1-none|wasm32-unknown-unknown/.test(r.stdout);
}

export function detectTools({ env = process.env, cwd = process.cwd(), findExec = name => findExecutable(name, env), runVer = runVersion } = {}) {
  const tools = TOOLS.map(t => {
    const p = findExec(t.name);
    return { ...t, found: !!p, path: p, version: p ? runVer(p) : null };
  });
  const hardhatLocal = path.join(cwd, 'node_modules', '.bin', isWindows ? 'hardhat.cmd' : 'hardhat');
  const hasHardhat = fs.existsSync(hardhatLocal);
  tools.push({ name: 'hardhat (local)', families: ['evm'], role: 'Hardhat del proyecto (node_modules/.bin)', hint: 'npm i -D hardhat', found: hasHardhat, path: hasHardhat ? hardhatLocal : null, version: null });
  const rustup = tools.find(t => t.name === 'rustup');
  if (rustup && rustup.found && runVer === runVersion) {
    const has = wasmTargetInstalled(rustup.path);
    tools.push({ name: 'wasm-target', families: ['stellar'], role: 'target wasm32v1-none o wasm32-unknown-unknown', hint: 'rustup target add wasm32v1-none', found: has === true, path: null, version: has === null ? 'no se pudo consultar' : null });
  }
  return tools;
}

const has = (tools, name) => tools.some(t => t.name === name && t.found);

export function verdictFor(family, tools) {
  const reasons = [];
  if (family === 'stellar') {
    const cli = has(tools, 'stellar');
    const cargo = has(tools, 'cargo');
    if (cli && cargo) {
      const wasm = tools.find(t => t.name === 'wasm-target');
      if (wasm && !wasm.found) reasons.push('falta el target wasm32: rustup target add wasm32v1-none (o wasm32-unknown-unknown)');
      return { verdict: 'SAFE', reasons };
    }
    if (cli || cargo) {
      reasons.push(cli ? 'sin cargo: se puede desplegar WASM ya compilado pero no construir (instalar Rust: https://rustup.rs)' : 'sin Stellar CLI: se puede compilar pero no desplegar ni invocar (cargo install --locked stellar-cli)');
      return { verdict: 'CAUTION', reasons };
    }
    reasons.push('ni Stellar CLI ni cargo: instalar Rust y stellar-cli antes de planificar');
    return { verdict: 'AVOID', reasons };
  }
  if (family === 'evm') {
    if (has(tools, 'forge') || has(tools, 'hardhat (local)')) {
      if (!has(tools, 'cast')) reasons.push('sin cast: las utilidades de wallet con alias y RPC de Foundry no estan');
      return { verdict: 'SAFE', reasons };
    }
    if (has(tools, 'node')) {
      reasons.push('sin compilador de Solidity: instalar Foundry (forge) o Hardhat en el proyecto');
      return { verdict: 'CAUTION', reasons };
    }
    reasons.push('sin node ni compilador');
    return { verdict: 'AVOID', reasons };
  }
  if (family === 'utxo') {
    if (has(tools, 'syscoin-cli')) return { verdict: 'SAFE', reasons };
    reasons.push('requiere nodo local: syscoin-cli no encontrado (https://docs.syscoin.org)');
    return { verdict: 'AVOID', reasons };
  }
  return { verdict: 'AVOID', reasons: [`familia desconocida ${family}`] };
}

export function doctor({ env, cwd, chain, findExec, runVer } = {}) {
  const tools = detectTools({ env, cwd, findExec, runVer });
  const verdicts = Object.fromEntries(FAMILIES.map(f => [f, verdictFor(f, tools)]));
  const out = { tools, verdicts };
  if (chain) {
    const c = getChain(chain);
    if (!c) out.chain = { id: chain, error: 'cadena desconocida' };
    else out.chain = { id: c.id, family: c.family, network: c.network, ...verdicts[c.family] };
  }
  return out;
}

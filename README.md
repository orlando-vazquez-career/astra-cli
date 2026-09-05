# astra — herramientas del protocolo ASTRA

`astra` es el CLI y el servidor MCP del [protocolo ASTRA](https://github.com/orlando-vazquez-career/astra-protocol), un protocolo de desarrollo Web3 asistido por agentes de IA: multi-cadena (Stellar, Syscoin, Base y cualquier EVM), multi-vendor (funciona con cualquier runtime de IA) e independiente.

- **Cero dependencias.** Node ≥ 20 y nada mas. Sin `npm install`, sin build.
- **Windows, macOS y Linux.** CI en los tres sistemas operativos con Node 20 y 22.
- **Local-first.** No envia telemetria ni llama a ninguna API de IA. Solo toca la red cuando se le pide sondear una cadena o clonar el protocolo.
- **Nunca firma ni custodia claves.** Si le pasas una clave secreta, te lo dice y no la imprime (axioma A2 del protocolo).

## Instalacion

```bash
git clone https://github.com/orlando-vazquez-career/astra-cli.git
cd astra-cli
node bin/astra.mjs --version      # astra 0.1.0
npm link                          # opcional: deja `astra` en el PATH (no instala dependencias)
```

Para que `astra init` y `astra skills sync` encuentren las plantillas y skills del protocolo:

```bash
astra protocol fetch              # clona astra-protocol en ~/.astra/protocol (requiere git)
astra protocol path               # muestra de donde lo esta leyendo
```

Tambien se resuelve desde `ASTRA_PROTOCOL_DIR`, desde `../../protocols/ASTRA` relativo al CLI o con `--protocol-dir <ruta>`.

## Comandos

| Comando | Que hace | Red |
|---|---|---|
| `astra doctor [--chain <id>]` | Detecta toolchains (stellar, cargo, forge, cast, anvil, syscoin-cli, docker, hardhat local, target wasm32) y da un veredicto **SAFE / CAUTION / AVOID** por familia de cadena. | no |
| `astra chain list` · `astra chain info <id>` | Registro de cadenas verificado: id, familia, red, chainId, CAIP-2, RPC, explorers, faucets, docs, notas. | no |
| `astra chain probe <id> [--rpc <url>]` | Sonda en vivo: valida que el chainId (EVM) o la passphrase (Stellar) coincidan con el registro; reporta bloque/ledger y latencia. | si |
| `astra address <cadena\|familia> <direccion>` | Valida formato y checksum: StrKey (SEP-0023), EIP-55 (keccak-256 propio), bech32/bech32m y base58check (Syscoin UTXO). Detecta claves secretas y se niega a imprimirlas. | no |
| `astra init [--chain <id>]... [--runtimes ...] [--protocol-dir <p>]` | Prepara un repo: `.astra/astra.json`, `.astra/deployments.json`, `docs/astra/*.md` desde las plantillas, bloque ASTRA en `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`, `.gitignore` con `.env`, skills en los runtimes elegidos. Idempotente. | no |
| `astra check [--gate mainnet]` | Escaner de secretos (semillas StrKey, claves EVM, mnemonicos, asignaciones sospechosas), higiene (`.env` versionados, material de claves, `.gitignore`), validez del registro de despliegues. Con `--gate mainnet` verifica ademas el checklist del Gate 2. Exit 1 si falla. | no |
| `astra deployments list` · `astra deployments add --chain <id> --address <a> [--kind] [--label] [--tx] [--verified]` | Registro atomico de todo lo desplegado (axioma A4), validado por familia. | no |
| `astra standards search "<consulta>" [--family ...]` | Busca en el catalogo local de estandares: SEP, CAP, ERC, EIP, CAIP, x402, MPP, docs de Syscoin/Rollux/Base. | no |
| `astra skills sync [--from <dir>] [--runtimes claude,codex,kimi,cursor,antigravity,all] [--check]` | Copia skills (formato Agent Skills) a los directorios de cada runtime; sirve tambien para instalar packs externos. `--check` detecta desvios. | no |
| `astra protocol path` · `astra protocol fetch [--dir <p>]` | Donde vive el protocolo / clonarlo o actualizarlo. | fetch: si |
| `astra mcp` | Servidor MCP por stdio (JSON-RPC 2.0, `protocolVersion 2024-11-05`) con las mismas capacidades como tools. | solo `astra_chain_probe` |

Todos aceptan `--json`. Codigos de salida: `0` ok, `1` fallo de verificacion o de red, `2` error de uso.

## Cadenas incluidas

| id | familia | red | chainId / CAIP-2 |
|---|---|---|---|
| `stellar-mainnet` | stellar | mainnet | `stellar:pubnet` |
| `stellar-testnet` | stellar | testnet | `stellar:testnet` |
| `base` | evm | mainnet | 8453 · `eip155:8453` |
| `base-sepolia` | evm | testnet | 84532 · `eip155:84532` |
| `syscoin-nevm` | evm | mainnet | 57 · `eip155:57` |
| `syscoin-tanenbaum` | evm | testnet | 5700 · `eip155:5700` |
| `rollux` | evm | mainnet | 570 · `eip155:570` |
| `rollux-tanenbaum` | evm | testnet | 57000 · `eip155:57000` |
| `syscoin-utxo` | utxo | mainnet | (nodo local, `syscoin-cli`) |

Cualquier otra EVM se sondea con `astra chain probe <id-parecido> --rpc <url>` o se agrega al registro: una entrada en `data/chains.json` con `verifiedAt` (fecha en que se probaron sus URLs en vivo) y una guia en el protocolo. Todos los endpoints del registro se verificaron en vivo el 2026-09-04; el RPC de Rollux testnet no respondio ese dia y su entrada lo dice.

## Registrar el servidor MCP

El servidor expone `astra_doctor`, `astra_chain_list`, `astra_chain_info`, `astra_chain_probe`, `astra_address_validate`, `astra_check`, `astra_deployments_list`, `astra_deployments_add` y `astra_standards_search`.

```bash
# Claude Code
claude mcp add astra -- node /ruta/a/astra-cli/bin/astra.mjs mcp

# Codex CLI
codex mcp add astra -- node /ruta/a/astra-cli/bin/astra.mjs mcp
```

Cursor (`.cursor/mcp.json`), Kimi Code (`~/.kimi-code/mcp.json`), Gemini CLI / Antigravity y OpenCode usan la misma forma JSON:

```json
{ "mcpServers": { "astra": { "command": "node", "args": ["/ruta/a/astra-cli/bin/astra.mjs", "mcp"] } } }
```

En Windows la ruta se escribe con barras normales o con `\\\\`.

## Politica de claves

El CLI no firma, no despliega y no guarda claves. Los despliegues los hace el humano (o un agente con alias de un keystore nativo: `stellar keys`, `cast wallet`) y `astra deployments add` los registra despues. `astra check` falla si encuentra una semilla StrKey, una clave privada EVM junto a `PRIVATE_KEY`/`secret`/`mnemonic`, un mnemonico o un `.env` versionado; el hallazgo dice archivo y linea, nunca el valor.

## Desarrollo

```bash
node --test "test/**/*.test.mjs"   # 46 tests: vectores SEP-0023, EIP-55, BIP-173/350, base58check; init, check, mcp e2e
node bin/astra.mjs check           # el repo se escanea a si mismo
```

Reglas del repo en `AGENTS.md`. Licencia MIT (DevZen SpA).

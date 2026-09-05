# AGENTS.md — astra-cli

Reglas para cualquier agente de IA (Claude Code, Codex, Kimi Code, Cursor, Gemini CLI, OpenCode...) que trabaje en este repo. `CLAUDE.md` importa este archivo; no hay otra fuente de reglas.

## Que es

`astra` es el CLI + servidor MCP del protocolo ASTRA (desarrollo Web3 agentico, multi-cadena, multi-vendor). Un paquete Node ≥ 20, ESM, **cero dependencias**, un modulo por responsabilidad en `lib/`, datos en `data/`, tests en `test/`.

## Reglas duras

1. **Cero dependencias.** Ni de runtime ni de desarrollo. Si algo parece necesitar una libreria (keccak, bech32, base58), se implementa y se prueba contra vectores publicos.
2. **Nunca imprimir, registrar ni devolver una clave secreta.** `validateAddress` marca `secret: true` y omite `normalized`; los findings de `check` dicen archivo y linea, nunca el valor. Los tests construyen secretos en runtime (jamas literales).
3. **Sin red salvo pedido explicito.** Solo `chain probe`, `astra_chain_probe` y `protocol fetch` tocan la red. Nada de telemetria, nada de APIs de IA.
4. **Toda URL o cadena nueva se verifica en vivo** antes de entrar a `data/chains.json` o `data/standards.json`, y se anota `verifiedAt`. Titulo y estado de un estandar se copian de la fuente oficial.
5. **Multiplataforma.** `node:path` siempre; `findExecutable` respeta `PATHEXT`; `.cmd/.bat` corren con `shell: true`; escrituras con `writeAtomic`. Todo test tiene que pasar en Windows, macOS y Linux (CI).
6. **Tests primero.** `node --test` en verde antes de cada commit; `node bin/astra.mjs check` sobre este repo tambien.
7. **Mensajes al usuario en español neutro**, identificadores en ingles, marcadores ASCII `OK` / `WARN` / `FAIL`, `--json` en todos los comandos, codigos de salida 0/1/2.

## Mapa

- `bin/astra.mjs` → `lib/cli.mjs` (parseo, tabla de comandos, ayuda) → `lib/commands/<cmd>.mjs` (`run({args, flags, stdout, stderr})`).
- `lib/registry.mjs` (cadenas) · `lib/probe.mjs` (sonda) · `lib/doctor.mjs` (toolchains) · `lib/address.mjs` + `lib/keccak.mjs` (direcciones) · `lib/deployments.mjs` (registro) · `lib/check.mjs` (secretos y gate) · `lib/standards.mjs` (catalogo) · `lib/skills.mjs` (sync) · `lib/protocol.mjs` (donde esta el protocolo) · `lib/init.mjs` (scaffolding) · `lib/mcp.mjs` (servidor MCP) · `lib/util.mjs`.
- La cabecera de cada modulo explica su contrato; es la documentacion operativa. El README documenta lo que ve el usuario.

## Commits

Prefijos `feat:`, `fix:`, `docs:`, `test:`, `chore:`; cuerpo en español; un cambio por commit.

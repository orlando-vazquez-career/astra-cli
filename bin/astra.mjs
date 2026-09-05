#!/usr/bin/env node
// bin/astra.mjs — punto de entrada del CLI `astra`.
import { main } from '../lib/cli.mjs';

process.exitCode = await main(process.argv.slice(2));

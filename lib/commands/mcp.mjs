// commands/mcp.mjs — `astra mcp`: servidor MCP por stdio hasta EOF.
import { startMcpServer } from '../mcp.mjs';
import { VERSION } from '../cli.mjs';

export async function run() {
  const server = startMcpServer({ version: VERSION });
  await new Promise(resolve => process.stdin.on('end', () => server.close().then(resolve, resolve)));
  return 0;
}

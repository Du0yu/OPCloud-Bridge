import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocket } from 'ws';

const port = 17473;
const serverPath = fileURLToPath(new URL('../mcp-server/server.js', import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: { ...process.env, OPCLOUD_BRIDGE_PORT: String(port) },
  stderr: 'pipe',
});
const client = new Client({ name: 'opcloud-bridge-test', version: '1.0.0' });

await client.connect(transport);
const browser = new WebSocket(`ws://127.0.0.1:${port}`, {
  origin: 'https://opcloud-sandbox.web.app',
});
await new Promise((resolve, reject) => {
  browser.once('open', resolve);
  browser.once('error', reject);
});

browser.send(JSON.stringify({
  type: 'hello',
  pageUrl: 'https://opcloud-sandbox.web.app/',
  userscriptVersion: 'test',
}));
browser.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type !== 'request') return;
  if (message.action === 'status') {
    browser.send(JSON.stringify({
      type: 'response',
      id: message.id,
      ok: true,
      result: { ready: true, modelName: 'Integration Test' },
    }));
  } else if (message.action === 'reviewSnapshot') {
    browser.send(JSON.stringify({
      type: 'response',
      id: message.id,
      ok: true,
      result: {
        modelSummary: { name: 'Integration Test', logicalElementCount: 2, opdCount: 1 },
        opl: 'Test Object is physical and systemic.',
        image: {
          fileName: 'Integration-Test.jpeg',
          mimeType: 'image/jpeg',
          dataBase64: '/9j/2Q==',
        },
      },
    }));
  }
});

const tools = await client.listTools();
assert.ok(tools.tools.some((tool) => tool.name === 'opcloud_get_model'));
assert.ok(tools.tools.some((tool) => tool.name === 'opcloud_export_image'));
assert.ok(tools.tools.some((tool) => tool.name === 'opcloud_review_diagram'));

const status = await client.callTool({ name: 'opcloud_status', arguments: {} });
assert.match(status.content[0].text, /Integration Test/);

const review = await client.callTool({ name: 'opcloud_review_diagram', arguments: {} });
assert.equal(review.content[1].type, 'image');
assert.equal(review.content[1].mimeType, 'image/jpeg');
assert.equal(review.content[1].data, '/9j/2Q==');

browser.close();
await client.close();
console.log('Validated MCP stdio to WebSocket bridge behavior.');

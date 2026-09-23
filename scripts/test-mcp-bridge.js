import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocket } from 'ws';
import { validateOpcloudModel } from '../mcp-server/model-validation.js';

const reservation = net.createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const serverPath = fileURLToPath(new URL('../mcp-server/server.js', import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: { ...process.env, OPCLOUD_BRIDGE_PORT: String(port), OPCLOUD_BRIDGE_IDLE_MS: '1000' },
  stderr: 'pipe',
});
const client = new Client({ name: 'opcloud-bridge-test', version: '1.0.0' });

await client.connect(transport);
const secondTransport = new StdioClientTransport({
  command: process.execPath, args: [serverPath],
  env: { ...process.env, OPCLOUD_BRIDGE_PORT: String(port), OPCLOUD_BRIDGE_IDLE_MS: '1000' }, stderr: 'pipe',
});
const second = new Client({ name: 'second-conversation', version: '1.0.0' });
await second.connect(secondTransport);
const readStatus = async (target) => JSON.parse((await target.callTool({ name: 'opcloud_status', arguments: {} })).content[0].text);
const [firstStatus, secondStatus] = await Promise.all([readStatus(client), readStatus(second)]);
assert.equal(firstStatus.connected, false);
assert.ok(firstStatus.servicePid);
assert.equal(firstStatus.servicePid, secondStatus.servicePid, 'Conversations must share one daemon.');
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
let activeBrowserCalls = 0;
let maxActiveBrowserCalls = 0;
browser.on('message', async (data) => {
  const message = JSON.parse(data.toString());
  if (message.type !== 'request') return;
  activeBrowserCalls++;
  maxActiveBrowserCalls = Math.max(maxActiveBrowserCalls, activeBrowserCalls);
  await new Promise((resolve) => setTimeout(resolve, 20));
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
  activeBrowserCalls--;
});

const tools = await client.listTools();
assert.ok(tools.tools.some((tool) => tool.name === 'opcloud_get_modeling_guide'));
assert.ok(tools.tools.some((tool) => tool.name === 'opcloud_get_model_template'));
assert.match(client.getInstructions(), /opcloud_get_modeling_guide/);
assert.ok(tools.tools.some((tool) => tool.name === 'opcloud_get_model'));
assert.ok(tools.tools.some((tool) => tool.name === 'opcloud_export_image'));
assert.ok(tools.tools.some((tool) => tool.name === 'opcloud_review_diagram'));

const status = await client.callTool({ name: 'opcloud_status', arguments: {} });
assert.match(status.content[0].text, /Integration Test/);
assert.equal((await readStatus(second)).opcloud.modelName, 'Integration Test');

const review = await client.callTool({ name: 'opcloud_review_diagram', arguments: {} });
assert.equal(review.content[1].type, 'image');
assert.equal(review.content[1].mimeType, 'image/jpeg');
assert.equal(review.content[1].data, '/9j/2Q==');
await Promise.all([client, second].map((target) => target.callTool({ name: 'opcloud_review_diagram', arguments: {} })));
assert.equal(maxActiveBrowserCalls, 1, 'Concurrent conversations must serialize browser operations.');

const invalidModel = JSON.parse(fs.readFileSync(new URL('../examples/Two-Dish-Dinner-Corrected.opcl', import.meta.url), 'utf8'));
invalidModel.currentOpd.visualElements = ['missing-visual'];
const importResult = await client.callTool({
  name: 'opcloud_import_model',
  arguments: { model: invalidModel, replaceExisting: true },
});
assert.equal(importResult.isError, true);
assert.match(importResult.content[0].text, /currentOpd references missing visual/);

const customModel = JSON.parse(fs.readFileSync(new URL('../examples/Two-Dish-Dinner-Corrected.opcl', import.meta.url), 'utf8'));
customModel.logicalElements[0].name = 'CustomSVGObject';
const customImport = await client.callTool({ name: 'opcloud_import_model', arguments: { model: customModel } });
assert.equal(customImport.isError, true);
assert.match(customImport.content[0].text, /Unsupported native element class/);

await client.close();
assert.equal((await readStatus(second)).connected, true, 'Closing one conversation must preserve the other.');
const browserClosed = new Promise((resolve) => browser.once('close', resolve));
browser.close();
await browserClosed;
assert.equal((await readStatus(second)).connected, false);

const reconnectBrowser = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://opcloud-sandbox.web.app' });
await new Promise((resolve, reject) => { reconnectBrowser.once('open', resolve); reconnectBrowser.once('error', reject); });
reconnectBrowser.on('message', (data) => {
  const request = JSON.parse(data);
  reconnectBrowser.send(JSON.stringify({ type: 'response', id: request.id, ok: true, result: { ready: true, modelName: 'Reconnected' } }));
});
assert.equal((await readStatus(second)).opcloud.modelName, 'Reconnected');

// A daemon crash must not kill tool discovery; the surviving session starts a replacement.
const daemonClosed = new Promise((resolve) => reconnectBrowser.once('close', resolve));
process.kill(firstStatus.servicePid);
await daemonClosed;
assert.equal((await second.listTools()).tools.length, 9);
let recovered;
for (let attempt = 0; attempt < 20; attempt++) {
  recovered = await readStatus(second);
  if (recovered.servicePid && recovered.servicePid !== firstStatus.servicePid) break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ok(recovered.servicePid && recovered.servicePid !== firstStatus.servicePid);
await second.close();

// Port conflicts must be reported by status without preventing tool registration.
const blocker = net.createServer();
await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
const blockedTransport = new StdioClientTransport({
  command: process.execPath, args: [serverPath],
  env: { ...process.env, OPCLOUD_BRIDGE_PORT: String(blocker.address().port) }, stderr: 'pipe',
});
const blockedClient = new Client({ name: 'blocked-port', version: '1.0.0' });
await blockedClient.connect(blockedTransport);
assert.equal((await blockedClient.listTools()).tools.length, 9);
const guide = JSON.parse((await blockedClient.callTool({ name: 'opcloud_get_modeling_guide', arguments: {} })).content[0].text);
assert.equal(guide.instructions, fs.readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8'));
assert.equal(guide.templateTool, 'opcloud_get_model_template');
assert.equal(guide.standardsCoverage.content, fs.readFileSync(new URL('../docs/iso-19450-2024-coverage.md', import.meta.url), 'utf8'));
assert.equal(guide.standardsCoverage.status, 'partial_checks_not_conformance_assessed');
const template = JSON.parse((await blockedClient.callTool({ name: 'opcloud_get_model_template', arguments: {} })).content[0].text);
assert.deepEqual(template, JSON.parse(fs.readFileSync(new URL('../examples/Two-Dish-Dinner-Corrected.opcl', import.meta.url), 'utf8')));
assert.equal(validateOpcloudModel(template).valid, true);
const assessment = JSON.parse((await blockedClient.callTool({ name: 'opcloud_validate_model', arguments: { model: template } })).content[0].text);
assert.equal(assessment.valid, true);
assert.equal(assessment.isoConformance, 'not_assessed');
assert.ok(assessment.semanticChecks.some((item) => item.ruleId === 'ISO-3.4-AGENT-HUMAN'));
const missingEffectStates = structuredClone(template);
missingEffectStates.logicalElements.find((element) => element.linkType === 0).linkType = 4;
const effectImport = await blockedClient.callTool({ name: 'opcloud_import_model', arguments: { model: missingEffectStates } });
assert.equal(effectImport.isError, true);
assert.match(effectImport.content[0].text, /PROFILE-EFFECT-STATE-EVIDENCE/);
assert.match((await readStatus(blockedClient)).error, /older bridge|another application/);
await blockedClient.close();
await new Promise((resolve) => blocker.close(resolve));
assert.throws(() => process.kill(recovered.servicePid, 0), 'The shared service must exit after the last session closes.');
console.log('Validated shared MCP sessions, browser reconnect, daemon recovery, and discovery under port conflicts.');

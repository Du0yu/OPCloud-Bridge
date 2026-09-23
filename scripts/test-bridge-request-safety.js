import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocket } from 'ws';
import { SharedBridge } from '../mcp-server/shared-bridge.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const reservation = net.createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../mcp-server/server.js', import.meta.url))],
  env: { ...process.env, OPCLOUD_BRIDGE_PORT: String(port), OPCLOUD_BRIDGE_IDLE_MS: '100' },
  stderr: 'pipe',
});
const client = new Client({ name: 'request-safety', version: '1' });
const shared = new SharedBridge({ port });
const sockets = [];
const connectBrowser = async (handler) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`, { origin: 'https://opcloud-sandbox.web.app' });
  sockets.push(socket);
  socket.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.type === 'request') handler(message, (result = {}) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'response', id: message.id, ok: true, result }));
    });
  });
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return socket;
};

try {
  await client.connect(transport);
  await client.callTool({ name: 'opcloud_status', arguments: {} });
  await shared.connect();
  let handle;
  await connectBrowser((...args) => handle(...args));
  const model = JSON.parse(fs.readFileSync(new URL('../examples/Two-Dish-Dinner-Corrected.opcl', import.meta.url), 'utf8'));

  // Real MCP cancellation and client-side timeout must remove queued mutations.
  for (const mode of ['abort', 'timeout']) {
    const started = deferred();
    let completeRead;
    let imports = 0;
    handle = (message, reply) => {
      if (message.action === 'getOpl') { completeRead = () => reply({ opl: 'test' }); started.resolve(); }
      else { if (message.action === 'importModel') imports++; reply({ ready: true }); }
    };
    const blocker = client.callTool({ name: 'opcloud_get_opl', arguments: {} });
    await started.promise;
    const controller = new AbortController();
    const options = mode === 'abort' ? { signal: controller.signal } : { timeout: 80 };
    const cancelled = client.callTool({ name: 'opcloud_import_model', arguments: { model, replaceExisting: true } }, undefined, options)
      .then(() => { throw new Error('Expected client cancellation.'); }, (error) => error);
    if (mode === 'abort') {
      await new Promise((resolve) => setTimeout(resolve, 80));
      controller.abort();
    }
    await cancelled;
    // Let the cancellation notification reach the server before releasing the blocker.
    await new Promise((resolve) => setTimeout(resolve, 50));
    completeRead();
    await blocker;
    await client.callTool({ name: 'opcloud_status', arguments: {} });
    assert.equal(imports, 0, `${mode} must prevent the queued import.`);
  }

  // A queued request must retain its original browser, even when another tab takes over.
  const started = deferred();
  handle = () => started.resolve();
  const blocked = shared.call('getModel', {}, 2000).catch((error) => error.message);
  await started.promise;
  const queued = shared.call('importModel', { model, replaceExisting: true }, 2000).catch((error) => error.message);
  await shared.status(); // FIFO IPC barrier: the import has arrived in the daemon queue.
  const newTabRequests = [];
  let newHandler = (message, reply) => { newTabRequests.push(message.action); reply(); };
  await connectBrowser((...args) => newHandler(...args));
  assert.match(await blocked, /replaced/);
  assert.match(await queued, /connection changed/);
  assert.deepEqual(newTabRequests, [], 'The new tab must not receive the old tab\'s import.');

  // Simulate a browser that keeps running an async operation after its caller times out.
  let finishSlow;
  let laterStarted = false;
  const slowStarted = deferred();
  newHandler = (message, reply) => {
    if (message.action === 'getOpl') { finishSlow = reply; slowStarted.resolve(); }
    else { laterStarted = true; reply(); }
  };
  const timedOut = shared.call('getOpl', {}, 80).catch((error) => error.message);
  await slowStarted.promise;
  const later = shared.call('getModel', {}, 2000);
  assert.match(await timedOut, /expired|timed out/);
  await shared.status();
  assert.equal(laterStarted, false, 'Timeout must not release an operation that is still executing.');
  finishSlow();
  await later;
  assert.equal(laterStarted, true);
  console.log('Validated MCP cancellation, queued browser identity, and serialization after timeout.');
} finally {
  for (const socket of sockets) socket.terminate();
  await shared.close();
  await client.close();
}

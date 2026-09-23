import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserBridge } from './browser-bridge.js';
import { bridgePipe, readMessages } from './shared-bridge.js';

const port = Number(process.env.OPCLOUD_BRIDGE_PORT || 17373);
const bridge = new BrowserBridge({ port });
// The WebSocket port is the single-owner lock. Losing simultaneous starters exit.
try { await bridge.listen(); } catch { process.exit(1); }
const pipe = bridgePipe(port);
if (process.platform !== 'win32') {
  await fs.mkdir(path.dirname(pipe), { recursive: true, mode: 0o700 });
  await fs.chmod(path.dirname(pipe), 0o700);
  await fs.rm(pipe, { force: true });
}
const peers = new Set();
let idleTimer;
let stopping = false;
const idleMs = Number(process.env.OPCLOUD_BRIDGE_IDLE_MS || 30000);
function scheduleIdle() {
  clearTimeout(idleTimer);
  if (!peers.size) idleTimer = setTimeout(shutdown, idleMs);
}
const allowedActions = new Set(['status', 'getModel', 'importModel', 'getOpl', 'exportImage', 'reviewSnapshot']);
// Keep browser operations ordered across conversations, including async rendering.
let queue = Promise.resolve();
const server = net.createServer((socket) => {
  const jobs = new Map();
  peers.add(socket);
  clearTimeout(idleTimer);
  socket.on('error', () => {});
  socket.on('close', () => {
    for (const job of jobs.values()) job.abort();
    peers.delete(socket);
    scheduleIdle();
  });
  readMessages(socket, (message) => {
    if (!message || typeof message.id !== 'string') return;
    if (message.type === 'cancel') {
      jobs.get(message.id)?.abort();
      return;
    }
    if (jobs.has(message.id)) return;
    const controller = new AbortController();
    jobs.set(message.id, controller);
    // Capture the target at arrival, not when this request eventually leaves the queue.
    const browser = bridge.client;
    const deadline = Date.now() + Math.max(1, Math.min(Number(message.timeoutMs) || 30000, 60000));
    const expiry = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    let responded = false;
    const respond = (response) => {
      if (responded) return;
      responded = true;
      clearTimeout(expiry);
      if (!socket.destroyed) socket.write(JSON.stringify({ id: message.id, ...response }) + '\n');
    };
    controller.signal.addEventListener('abort', () => respond({ ok: false, error: 'Bridge request cancelled or expired.' }), { once: true });
    const execute = async () => {
      let operation;
      try {
        controller.signal.throwIfAborted();
        if (socket.destroyed) throw new Error('MCP session disconnected.');
        let result;
        if (message.action === 'bridgeStatus') result = { ...bridge.status(), servicePid: process.pid, sessions: peers.size };
        else {
          if (!allowedActions.has(message.action)) throw new Error('Unsupported bridge action.');
          if (!browser || browser !== bridge.client || !bridge.isConnected()) {
            throw new Error('OPCloud browser connection changed or disconnected while the request was queued. Read the current model before retrying.');
          }
          const timeout = deadline - Date.now();
          if (timeout <= 0) throw new Error('Bridge request expired while queued.');
          operation = bridge.call(message.action, message.payload, timeout, controller.signal);
          result = await operation;
        }
        respond({ ok: true, result });
      } catch (error) { respond({ ok: false, error: error.message }); }
      finally {
        clearTimeout(expiry);
        // A caller timeout is not evidence that the browser stopped executing.
        await operation?.drained;
        jobs.delete(message.id);
      }
    };
    if (message.action === 'bridgeStatus') void execute();
    else {
      queue = queue.then(execute);
    }
  });
});
server.on('error', () => void shutdown());
server.listen(pipe, scheduleIdle);
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(idleTimer);
  for (const peer of peers) peer.destroy();
  server.close();
  await bridge.close();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

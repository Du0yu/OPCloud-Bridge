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
  peers.add(socket);
  clearTimeout(idleTimer);
  socket.on('error', () => {});
  socket.on('close', () => { peers.delete(socket); scheduleIdle(); });
  readMessages(socket, (message) => {
    const respond = (response) => {
      if (!socket.destroyed) socket.write(JSON.stringify({ id: message.id, ...response }) + '\n');
    };
    const execute = async () => {
      if (socket.destroyed) return;
      try {
        let result;
        if (message.action === 'bridgeStatus') result = { ...bridge.status(), servicePid: process.pid, sessions: peers.size };
        else {
          if (!allowedActions.has(message.action)) throw new Error('Unsupported bridge action.');
          const timeout = Math.max(1, Math.min(Number(message.timeoutMs) || 30000, 60000));
          result = await bridge.call(message.action, message.payload, timeout);
        }
        respond({ ok: true, result });
      } catch (error) { respond({ ok: false, error: error.message }); }
    };
    if (message.action === 'bridgeStatus') void execute();
    else {
      // Expire queued work instead of applying a mutation after its caller timed out.
      const deadline = Date.now() + Math.min(Number(message.timeoutMs) || 30000, 60000);
      queue = queue.then(() => {
        message.timeoutMs = deadline - Date.now();
        return message.timeoutMs <= 0
          ? respond({ ok: false, error: 'Bridge request expired while queued.' }) : execute();
      });
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

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function bridgePipe(port) {
  const user = createHash('sha256').update(os.homedir()).digest('hex').slice(0, 16);
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\opcloud-${user}-${port}`
    : path.join(os.tmpdir(), `opcloud-${user}-${port}`, 'bridge.sock');
}

export function readMessages(socket, handler) {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > 64 * 1024 * 1024) return socket.destroy();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try { handler(JSON.parse(line)); } catch { socket.destroy(); return; }
    }
  });
}

export class SharedBridge {
  constructor({ port }) {
    this.port = port;
    this.socket = null;
    this.pending = new Map();
    this.closed = false;
    this.connecting = null;
  }

  async connect() {
    if (this.closed) throw new Error('Bridge client is closed.');
    if (this.socket && !this.socket.destroyed) return;
    if (!this.connecting) {
      this.connecting = this.open().finally(() => { this.connecting = null; });
    }
    return this.connecting;
  }

  async open() {
    for (let attempt = 0; attempt < 40 && !this.closed; attempt++) {
      try {
        const socket = await new Promise((resolve, reject) => {
          const candidate = net.createConnection(bridgePipe(this.port));
          candidate.once('error', reject);
          candidate.once('connect', () => {
            candidate.removeListener('error', reject);
            candidate.on('error', () => {});
            resolve(candidate);
          });
        });
        if (this.closed) { socket.destroy(); throw new Error('Bridge client is closed.'); }
        this.socket = socket;
        socket.on('close', () => {
          if (this.socket !== socket) return;
          this.socket = null;
          this.rejectPending(new Error('Shared bridge disconnected. Retry the tool call; changes are never replayed automatically.'));
        });
        readMessages(socket, (message) => {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          clearTimeout(pending.timer);
          if (message.ok) pending.resolve(message.result);
          else pending.reject(new Error(message.error));
        });
        return;
      } catch {
        if (this.closed) break;
        if (attempt === 0) {
          const child = spawn(process.execPath, [fileURLToPath(new URL('./bridge-daemon.js', import.meta.url))], {
            env: { ...process.env, OPCLOUD_BRIDGE_PORT: String(this.port) },
            detached: true, stdio: 'ignore', windowsHide: true,
          });
          child.on('error', () => {});
          child.unref();
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error(`Shared bridge unavailable on port ${this.port}. An older bridge or another application may own this port; stop that process and retry.`);
  }

  async call(action, payload = {}, timeoutMs = 30000) {
    await this.connect();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Shared bridge request timed out: ${action}`));
      }, timeoutMs + 1000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ id, action, payload, timeoutMs }) + '\n');
    });
  }

  async status() {
    try { return await this.call('bridgeStatus'); }
    catch (error) { return { connected: false, endpoint: `ws://127.0.0.1:${this.port}`, error: error.message }; }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async close() {
    this.closed = true;
    this.rejectPending(new Error('MCP session closed.'));
    this.socket?.destroy();
  }
}

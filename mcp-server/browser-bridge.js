import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

const ALLOWED_ORIGINS = new Set([
  'https://opcloud-sandbox.web.app',
]);

export class BrowserBridge {
  constructor({ host = '127.0.0.1', port = 17373, requestTimeoutMs = 30000 } = {}) {
    this.host = host;
    this.port = port;
    this.requestTimeoutMs = requestTimeoutMs;
    this.server = null;
    this.client = null;
    this.clientInfo = null;
    this.pending = new Map();
  }

  async listen() {
    if (this.server) return;
    await new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        host: this.host,
        port: this.port,
        verifyClient: ({ origin }, done) => {
          done(ALLOWED_ORIGINS.has(origin), 403, 'Origin not allowed');
        },
      });
      this.server = server;
      server.once('listening', resolve);
      server.once('error', reject);
      server.on('connection', (socket, request) => this.handleConnection(socket, request));
    });
  }

  handleConnection(socket, request) {
    if (this.client && this.client.readyState === WebSocket.OPEN) {
      this.client.close(1012, 'Replaced by a newer OPCloud tab');
    }

    this.rejectPending(new Error('OPCloud browser connection was replaced.'));
    this.client = socket;
    this.clientInfo = {
      connectedAt: new Date().toISOString(),
      origin: request.headers.origin,
      pageUrl: null,
      userscriptVersion: null,
    };

    socket.on('message', (data) => this.handleMessage(data));
    socket.on('close', () => {
      if (this.client !== socket) return;
      this.client = null;
      this.clientInfo = null;
      this.rejectPending(new Error('OPCloud browser disconnected.'));
      console.error('[OPCloud Bridge] Browser disconnected.');
    });
    socket.on('error', (error) => {
      console.error(`[OPCloud Bridge] Browser socket error: ${error.message}`);
    });
    console.error('[OPCloud Bridge] OPCloud browser connected.');
  }

  handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString('utf8'));
    } catch {
      return;
    }

    if (message.type === 'hello') {
      this.clientInfo = {
        ...this.clientInfo,
        pageUrl: message.pageUrl || null,
        userscriptVersion: message.userscriptVersion || null,
      };
      return;
    }

    if (message.type !== 'response' || !message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message.result);
    else pending.reject(new Error(message.error || 'Unknown browser bridge error.'));
  }

  isConnected() {
    return Boolean(this.client && this.client.readyState === WebSocket.OPEN);
  }

  status() {
    return {
      connected: this.isConnected(),
      endpoint: `ws://${this.host}:${this.port}`,
      browser: this.clientInfo,
    };
  }

  call(action, payload = {}, timeoutMs = this.requestTimeoutMs) {
    if (!this.isConnected()) {
      throw new Error('No OPCloud browser is connected. Open or refresh https://opcloud-sandbox.web.app/.');
    }

    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser request timed out: ${action}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.client.send(JSON.stringify({ type: 'request', id, action, payload }));
    });
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async close() {
    this.rejectPending(new Error('OPCloud bridge is shutting down.'));
    if (this.client) this.client.close(1001, 'Server shutdown');
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(resolve));
    this.server = null;
  }
}

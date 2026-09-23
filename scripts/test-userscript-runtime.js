import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../opcloud-model-io.user.js', import.meta.url), 'utf8');
const start = source.indexOf('  function applyImportedModel(');
const end = source.indexOf('  function saveOpl(', start);
assert.ok(start >= 0 && end > start, 'Import and OPL helpers must be present.');

let modelData = { name: 'Original', logicalElements: [{ lid: 'original' }] };
let failNextRender = true;
const model = {
  toJson: () => structuredClone(modelData),
  fromJson: (json) => { modelData = structuredClone(json); },
  get currentOpd() { return { id: 'SD' }; },
};
const service = {
  oplService: { userOplSettings: {} },
  modelService: {
    setName: (name) => { modelData.name = name; },
    getOPL: () => '." lid="abc">First sentence. ." lid="def">Second sentence.',
  },
  getTreeView: () => ({ init: () => {}, expandAllNodes: () => {} }),
  getGraphService: () => ({ renderGraph: () => {
    if (failNextRender) {
      failNextRender = false;
      throw new Error('render failed');
    }
  } }),
};
const context = {
  currentModel: () => model,
  initService: service,
  t: (key) => key,
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}\nthis.renderImportedModel = renderImportedModel; this.generatedOpl = generatedOpl;`, context);

assert.throws(() => context.renderImportedModel({ name: 'Replacement', logicalElements: [] }), /render failed/);
assert.deepEqual(modelData, { name: 'Original', logicalElements: [{ lid: 'original' }] });
assert.equal(context.generatedOpl(), 'First sentence.\nSecond sentence.');

console.log('Validated userscript import rollback and plain OPL output.');

const sockets = [];
const timers = new Map();
let timerId = 0;
let bridgeStatus;
let resolveAction;
class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  constructor() { this.readyState = 0; this.handlers = {}; this.sent = []; sockets.push(this); }
  addEventListener(event, handler) { this.handlers[event] = handler; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 2; }
  emit(event, data = {}) {
    if (event === 'open') this.readyState = 1;
    if (event === 'close') this.readyState = 3;
    return this.handlers[event]?.({ currentTarget: this, ...data });
  }
}
const bridgeContext = vm.createContext({
  page: { WebSocket: FakeSocket, location: { href: 'https://opcloud-sandbox.web.app/' } },
  window: {
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
  },
  t: (key) => key,
  console,
  setBridgeStatus: (value) => { bridgeStatus = value; },
  bridgeUrl: () => 'ws://127.0.0.1:17373',
  handleBridgeAction: () => new Promise((resolve) => { resolveAction = resolve; }),
});
vm.runInContext(`let bridgeSocket = null, bridgeReconnectTimer = null, bridgeReconnectDelay = 1000;
  const USERSCRIPT_VERSION = 'test';
  ${source.slice(source.indexOf('  function sendBridgeMessage('), source.indexOf('  async function importModel('))}
  this.connectBridge = connectBridge; this.restartBridge = restartBridge;`, bridgeContext);
bridgeContext.connectBridge();
const oldSocket = sockets[0];
oldSocket.emit('open');
assert.equal(bridgeStatus, 'bridgeConnected');
const inFlight = oldSocket.emit('message', { data: JSON.stringify({ type: 'request', id: 'old', action: 'getModel' }) });
bridgeContext.restartBridge();
assert.equal(oldSocket.readyState, 2);
const newSocket = sockets[1];
newSocket.emit('open');
oldSocket.emit('close', { code: 1000 });
assert.equal(bridgeStatus, 'bridgeConnected', 'Stale close must not reset the new connection.');
assert.equal(timers.size, 0, 'Manual restart must not create duplicate reconnect timers.');
resolveAction({ model: 'original' });
await inFlight;
assert.equal(newSocket.sent.length, 1, 'A response from an old connection must not leak to the new socket.');
newSocket.emit('close', { code: 1012 });
assert.equal(bridgeStatus, 'bridgeReplaced');
assert.equal(timers.size, 0, 'Replaced tabs must not fight for the bridge.');
bridgeContext.restartBridge();
const thirdSocket = sockets[2];
thirdSocket.emit('open');
thirdSocket.emit('close', { code: 1006 });
assert.equal(timers.size, 1, 'Unexpected disconnection must schedule automatic recovery.');
bridgeContext.restartBridge();
assert.equal(timers.size, 1, 'Restart cancels the old retry and leaves only the connection watchdog.');
console.log('Validated frontend restart, stale events, response isolation, and automatic reconnect.');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../opcloud-model-io.user.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('  function applyImportedModel('), source.indexOf('  function plainOpl('));
const original = { name: 'Original', logicalElements: [], opds: [{ id: 'SD' }] };
const storage = new Map();
let failStorage = false;
function boot() {
  let data = structuredClone(original);
  let failRender = false;
  const model = {
    toJson: () => data,
    fromJson: (value) => { data = structuredClone(value); },
    get currentOpd() { return data.opds[0]; },
  };
  const context = vm.createContext({
    PANEL_ID: 'test-panel',
    currentModel: () => model,
    initService: {
      getTreeView: () => ({ init() {} }),
      getGraphService: () => ({ renderGraph() { if (failRender) { failRender = false; throw new Error('render failed'); } } }),
      modelService: { setName: (name) => { data.name = name; } },
    },
    page: {
      sessionStorage: { getItem: () => 'test-tab' },
      localStorage: {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => { if (failStorage) throw new Error('quota'); storage.set(key, value); },
      },
    },
    document: { getElementById: () => null, addEventListener() {} },
    window: { setInterval() {}, addEventListener() {} },
    validateModel: (json) => { assert.ok(Array.isArray(json.opds)); return json; },
    t: (key) => key,
    setStatus() {},
  });
  vm.runInContext(`${helpers}
    this.api = { startModelHistory, captureModel, undoModel, restoreBackup, keepCurrentModel, renderImportedModel,
      state: () => ({ count: history.length, pending: !!pendingBackup, error: backupError }) };`, context);
  context.api.startModelHistory();
  return { api: context.api, data: () => data, edit: (name) => { data.name = name; }, fail: () => { failRender = true; } };
}

const first = boot();
first.edit('Edit one');
first.api.captureModel();
first.api.captureModel();
assert.equal(first.api.state().count, 1, 'Unchanged samples do not create history.');
first.edit('Unsampled edit');
first.api.undoModel();
assert.equal(first.data().name, 'Edit one', 'Undo first captures edits made since the last sample.');
first.api.undoModel();
assert.equal(first.data().name, 'Original');
first.api.renderImportedModel({ ...original, name: 'Imported' });
first.fail();
first.api.undoModel();
assert.equal(first.data().name, 'Imported', 'Failed undo rolls back the live model.');
assert.equal(first.api.state().count, 1, 'Failed undo preserves history.');
first.api.undoModel();
assert.equal(first.data().name, 'Original');
first.api.renderImportedModel({ ...original, name: 'Saved work' });
const saved = storage.get('opcloudBridgeBackup:test-tab');
const reload = boot();
assert.equal(reload.api.state().pending, true);
assert.equal(storage.get('opcloudBridgeBackup:test-tab'), saved, 'Startup must not overwrite recovery data.');
reload.fail();
reload.api.restoreBackup();
assert.equal(reload.api.state().pending, true, 'Failed recovery retains the backup.');
reload.api.restoreBackup();
assert.equal(reload.data().name, 'Saved work');
assert.equal(reload.api.state().pending, false);
reload.api.undoModel();
assert.equal(reload.data().name, 'Original', 'Backup recovery itself is undoable.');
failStorage = true;
reload.edit('Quota edit');
reload.api.captureModel();
assert.equal(reload.api.state().error, 'quota');
reload.api.undoModel();
assert.equal(reload.data().name, 'Original', 'Storage failure must not disable undo.');
failStorage = false;
reload.api.captureModel();
for (let index = 0; index < 40; index++) { reload.edit(`Edit ${index}`); reload.api.captureModel(); }
assert.equal(reload.api.state().count, 30);
const discard = boot();
discard.api.keepCurrentModel();
assert.equal(discard.api.state().pending, false);
assert.equal(JSON.parse(storage.get('opcloudBridgeBackup:test-tab')).model.name, 'Original');
console.log('Validated autosave, reload recovery, undo, rollback, quota errors, and bounded history.');

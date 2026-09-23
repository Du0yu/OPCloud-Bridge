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

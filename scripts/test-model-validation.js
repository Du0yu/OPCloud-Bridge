import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateOpcloudModel } from '../mcp-server/model-validation.js';

const model = JSON.parse(fs.readFileSync(new URL('../examples/Two-Dish-Dinner-Corrected.opcl', import.meta.url), 'utf8'));
const validResult = validateOpcloudModel(model);
assert.equal(validResult.valid, true, validResult.errors.join('\n'));

const invalidModel = structuredClone(model);
invalidModel.currentOpd.id = 'missing-opd';
const invalidResult = validateOpcloudModel(invalidModel);
assert.equal(invalidResult.valid, false);
assert.ok(invalidResult.errors.some((error) => error.includes('missing OPD')));

function expectInvalid(change, expectedError) {
  const candidate = structuredClone(model);
  change(candidate);
  const result = validateOpcloudModel(candidate);
  assert.equal(result.valid, false, `${expectedError} should fail validation.`);
  assert.ok(result.errors.some((error) => error.includes(expectedError)), result.errors.join('\n'));
}

expectInvalid((candidate) => {
  candidate.opds[0].visualElements.pop();
  candidate.currentOpd.visualElements.pop();
}, 'is not listed in any OPD');

expectInvalid((candidate) => {
  candidate.currentOpd.visualElements = ['missing-visual'];
}, 'currentOpd references missing visual');

expectInvalid((candidate) => {
  candidate.currentOpd.visualElements.pop();
}, 'does not match OPD');

expectInvalid((candidate) => {
  const relation = candidate.logicalElements.find((element) => element.name.endsWith('Relation'));
  delete relation.visualElementsParams[0].sourceVisualElement;
}, 'references missing source');

expectInvalid((candidate) => {
  const relation = candidate.logicalElements.find((element) => element.name.endsWith('Relation'));
  relation.visualElementsParams[0].targetVisualElements = [];
}, 'has no targets');

console.log('Validated MCP model validation behavior.');

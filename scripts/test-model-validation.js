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

const find = (model, name) => model.logicalElements.find((element) => element.name === name);
expectInvalid((candidate) => { candidate.logicalElements[0].name = 'CustomSVGObject'; }, 'Unsupported native element class');
expectInvalid((candidate) => { find(candidate, 'OpmProceduralRelation').linkType = 999; }, 'unsupported linkType');
expectInvalid((candidate) => { find(candidate, 'OpmProceduralRelation').linkType = '0'; }, 'unsupported linkType');
expectInvalid((candidate) => { find(candidate, 'OpmProceduralRelation').linkType = 11; }, 'requires OpmFundamentalRelation');
expectInvalid((candidate) => {
  const relation = find(candidate, 'OpmProceduralRelation').visualElementsParams[0];
  [relation.sourceVisualElement, relation.targetVisualElements[0].targetVisualElement] =
    [relation.targetVisualElements[0].targetVisualElement, relation.sourceVisualElement];
}, 'invalid endpoint kinds or direction');
expectInvalid((candidate) => { find(candidate, 'OpmLogicalObject').essence = 1; }, 'PROFILE-AGENT-PHYSICAL');
expectInvalid((candidate) => {
  find(candidate, 'OpmLogicalState').visualElementsParams[0].fatherObjectId = find(candidate, 'OpmLogicalProcess').visualElementsParams[0].id;
}, 'references missing object fatherObjectId');
expectInvalid((candidate) => {
  find(candidate, 'OpmLogicalProcess').visualElementsParams[0].children.push(find(candidate, 'OpmLogicalState').visualElementsParams[0].id);
}, 'must belong to its corresponding object');
expectInvalid((candidate) => { find(candidate, 'OpmLogicalObject').visualElementsParams[0].children.push('missing-child'); }, 'references missing child');

// Preserve native fields not yet understood by the bridge; do not reduce the export schema.
const withMetadata = structuredClone(model);
withMetadata.logicalElements[0].futureNativeMetadata = { note: 'preserve me' };
assert.equal(validateOpcloudModel(withMetadata).valid, true);
assert.deepEqual(withMetadata.logicalElements[0].futureNativeMetadata, { note: 'preserve me' });
console.log('Validated native classes, supported link families and directions, and state ownership.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { validateOpcloudModel } from '../mcp-server/model-validation.js';

// Synthetic in-memory fixtures based on full native exports; no live models are imported.
const canonical = JSON.parse(readFileSync(new URL('../examples/Two-Dish-Dinner-Corrected.opcl', import.meta.url), 'utf8'));
const clone = () => structuredClone(canonical);
const byVisual = (model, id) => model.logicalElements.find((element) => element.visualElementsParams.some((visual) => visual.id === id));
const visualOf = (model, id) => byVisual(model, id).visualElementsParams.find((visual) => visual.id === id);
function check(model) {
  const before = JSON.stringify(model);
  const result = validateOpcloudModel(model);
  assert.equal(result.isoConformance, 'not_assessed');
  assert.equal(JSON.stringify(model), before, 'Validation must preserve the original export.');
  return result;
}
function effectFixture() {
  const model = clone();
  const state = model.logicalElements.find((element) => element.name === 'OpmLogicalState');
  const objectId = state.visualElementsParams[0].fatherObjectId;
  const object = byVisual(model, objectId);
  const process = model.logicalElements.filter((element) => element.name === 'OpmLogicalProcess').at(-1);
  const relation = model.logicalElements.find((element) => element.name === 'OpmProceduralRelation' && element.linkType === 1);
  relation.linkType = 4;
  const visual = relation.visualElementsParams[0];
  visual.sourceVisualElement = objectId;
  visual.targetVisualElements = [{ targetVisualElement: process.visualElementsParams[0].id, vertices: null }];
  return { model, object, objectId, state, process, relation, visual };
}

// ISO-3.4-AGENT-HUMAN: labels do not establish human identity.
for (const label of ['Human Operator', 'Autonomous Robot']) {
  const model = clone();
  const agent = model.logicalElements.find((element) => element.linkType === 0);
  const object = byVisual(model, agent.visualElementsParams[0].sourceVisualElement);
  object.text = label;
  object.affiliation = 0; // A systemic affiliation must not be rejected as an ISO violation.
  const result = check(model);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.ok(result.semanticChecks.some((item) => item.ruleId === 'ISO-3.4-AGENT-HUMAN' && item.objectId === object.lid && item.status === 'needs_review'));
  assert.equal(result.requiresSemanticReview, true);
}
{
  const model = clone();
  const agent = model.logicalElements.find((element) => element.linkType === 0);
  byVisual(model, agent.visualElementsParams[0].sourceVisualElement).essence = 1;
  assert.ok(check(model).errors.some((error) => error.includes('PROFILE-AGENT-PHYSICAL')));
}

// ISO-3.3-EFFECT-CHANGE: structural evidence is necessary for this profile, not proof of a transition.
for (const variant of ['object', 'reversed', 'state']) {
  const { model, object, state, visual } = effectFixture();
  if (variant === 'reversed') {
    [visual.sourceVisualElement, visual.targetVisualElements[0].targetVisualElement] =
      [visual.targetVisualElements[0].targetVisualElement, visual.sourceVisualElement];
  }
  if (variant === 'state') visual.sourceVisualElement = state.visualElementsParams[0].id;
  const result = check(model);
  assert.equal(result.valid, true, result.errors.join('\n'));
  const finding = result.semanticChecks.find((item) => item.ruleId === 'ISO-3.3-EFFECT-CHANGE');
  assert.equal(finding.objectId, object.lid);
  assert.equal(finding.stateEvidence, 'owned_native_states');
  assert.equal(finding.status, 'needs_review');
}
{
  const { model, visual } = effectFixture();
  const object = model.logicalElements.find((element) => element.name === 'OpmLogicalObject' && !element.visualElementsParams[0].children.length);
  visual.sourceVisualElement = object.visualElementsParams[0].id;
  let result = check(model);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('PROFILE-EFFECT-STATE-EVIDENCE')));
  object.statesWithoutVisual = [{ opaqueNativeStateRecord: 'unknown format must be preserved' }];
  result = check(model);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.semanticChecks.find((item) => item.ruleId === 'ISO-3.3-EFFECT-CHANGE').stateEvidence, 'unverified_suppressed_states');
  assert.equal(result.requiresSemanticReview, true);
}

// Effect in a second OPD must find owned states in the object's other visual representation.
{
  const { model, object, objectId, process, relation } = effectFixture();
  const objectView = { ...structuredClone(visualOf(model, objectId)), id: randomUUID(), children: [], ports: [] };
  const processView = { ...structuredClone(process.visualElementsParams[0]), id: randomUUID(), children: [], ports: [] };
  object.visualElementsParams.push(objectView);
  process.visualElementsParams.push(processView);
  const effectView = structuredClone(relation);
  effectView.lid = randomUUID();
  effectView.visualElementsParams = [{ ...structuredClone(relation.visualElementsParams[0]), id: randomUUID(),
    sourceVisualElement: objectView.id, targetVisualElements: [{ targetVisualElement: processView.id, vertices: null }] }];
  model.logicalElements.push(effectView);
  const opd = { ...structuredClone(model.opds[0]), id: randomUUID(), visualElements: [objectView.id, processView.id, effectView.visualElementsParams[0].id] };
  model.opds.push(opd);
  model.currentOpd = structuredClone(opd);
  const result = check(model);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.semanticChecks.find((item) => item.relationId === effectView.lid).stateEvidence, 'owned_native_states');
}
assert.equal(validateOpcloudModel(null).isoConformance, 'not_assessed');
assert.equal(validateOpcloudModel({}).isoConformance, 'not_assessed');
console.log('Validated partial ISO Agent/Effect rules, profile boundaries, and honest conformance reporting.');

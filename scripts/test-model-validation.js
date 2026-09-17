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

console.log('Validated MCP model validation behavior.');

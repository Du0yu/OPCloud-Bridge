const fs = require('fs');
const path = require('path');

const modelPath = path.join(__dirname, '..', 'examples', 'Two-Dish-Dinner-Corrected.opcl');
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

if (!Array.isArray(model.logicalElements) || !Array.isArray(model.opds) || model.opds.length === 0) {
  throw new Error('Example is missing logicalElements or OPDs.');
}

const visualIds = model.logicalElements.flatMap((element) =>
  (element.visualElementsParams || []).map((visual) => visual.id)
);
const idSet = new Set(visualIds);

if (idSet.size !== visualIds.length) throw new Error('Duplicate visual IDs found.');

for (const opd of model.opds) {
  for (const id of opd.visualElements || []) {
    if (!idSet.has(id)) throw new Error(`OPD references missing visual ID: ${id}`);
  }
}

for (const element of model.logicalElements) {
  if (element.name === 'OpmLogicalState') {
    for (const visual of element.visualElementsParams || []) {
      if (!idSet.has(visual.fatherObjectId)) {
        throw new Error(`State references missing parent object: ${visual.fatherObjectId}`);
      }
    }
  }

  if (!element.name?.endsWith('Relation')) continue;
  for (const visual of element.visualElementsParams || []) {
    if (!idSet.has(visual.sourceVisualElement)) {
      throw new Error(`Relation references missing source: ${visual.sourceVisualElement}`);
    }
    for (const target of visual.targetVisualElements || []) {
      if (!idSet.has(target.targetVisualElement)) {
        throw new Error(`Relation references missing target: ${target.targetVisualElement}`);
      }
    }
  }
}

console.log(`Validated ${model.name}: ${model.logicalElements.length} logical elements.`);

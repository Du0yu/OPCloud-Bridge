export function validateOpcloudModel(model) {
  const errors = [];
  const warnings = [];

  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    return { valid: false, errors: ['Model must be a JSON object.'], warnings };
  }

  if (!Array.isArray(model.logicalElements)) errors.push('logicalElements must be an array.');
  if (!Array.isArray(model.opds)) errors.push('opds must be an array.');
  if (errors.length > 0) return { valid: false, errors, warnings };
  if (model.opds.length === 0) errors.push('The model must contain at least one OPD.');

  const logicalIds = new Set();
  const visualIds = new Set();
  const visuals = [];
  for (const logical of model.logicalElements) {
    if (!logical?.lid) {
      errors.push('A logical element is missing lid.');
    } else if (logicalIds.has(logical.lid)) {
      errors.push(`Duplicate logical lid: ${logical.lid}`);
    } else {
      logicalIds.add(logical.lid);
    }

    if (!Array.isArray(logical?.visualElementsParams)) {
      warnings.push(`Logical element ${logical?.lid || '(unknown)'} has no visualElementsParams array.`);
      continue;
    }
    for (const visual of logical.visualElementsParams) {
      if (!visual?.id) {
        errors.push(`A visual for logical element ${logical?.lid || '(unknown)'} is missing id.`);
      } else if (visualIds.has(visual.id)) {
        errors.push(`Duplicate visual id: ${visual.id}`);
      } else {
        visualIds.add(visual.id);
        visuals.push(visual);
      }
    }
  }

  const opdIds = new Set();
  for (const opd of model.opds) {
    if (!opd?.id) {
      errors.push('An OPD is missing id.');
    } else if (opdIds.has(opd.id)) {
      errors.push(`Duplicate OPD id: ${opd.id}`);
    } else {
      opdIds.add(opd.id);
    }

    if (!Array.isArray(opd?.visualElements)) {
      errors.push(`OPD ${opd?.id || '(unknown)'} has no visualElements array.`);
      continue;
    }

    for (const visualId of opd.visualElements) {
      if (!visualIds.has(visualId)) {
        errors.push(`OPD ${opd.id || '(unknown)'} references missing visual ${visualId}.`);
      }
    }
  }

  for (const visual of visuals) {
    if (visual.fatherObjectId && !visualIds.has(visual.fatherObjectId)) {
      errors.push(`State ${visual.id} references missing fatherObjectId ${visual.fatherObjectId}.`);
    }
    if (visual.fatherObjectId) {
      const parent = visuals.find((candidate) => candidate.id === visual.fatherObjectId);
      if (!parent?.children?.includes(visual.id)) {
        errors.push(`Parent object ${visual.fatherObjectId} does not list state ${visual.id} as a child.`);
      }
    }

    const sourceId = visual.sourceVisualElement;
    if (sourceId && !visualIds.has(sourceId)) {
      errors.push(`Relation ${visual.id} references missing source ${sourceId}.`);
    }
    if (Array.isArray(visual.targetVisualElements)) {
      for (const target of visual.targetVisualElements) {
        const targetId = target?.targetVisualElement;
        if (targetId && !visualIds.has(targetId)) {
          errors.push(`Relation ${visual.id} references missing target ${targetId}.`);
        }
      }
    }
  }

  const currentOpdId = model.currentOpd?.id;
  if (!currentOpdId) {
    errors.push('currentOpd.id is missing.');
  } else if (!opdIds.has(currentOpdId)) {
    errors.push(`currentOpd.id references missing OPD ${currentOpdId}.`);
  }

  if (!model.name) warnings.push('Model name is empty.');
  return { valid: errors.length === 0, errors, warnings };
}

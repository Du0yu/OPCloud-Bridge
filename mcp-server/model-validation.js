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
  const visuals = new Map();
  for (const logical of model.logicalElements) {
    if (!logical?.lid) {
      errors.push('A logical element is missing lid.');
    } else if (logicalIds.has(logical.lid)) {
      errors.push(`Duplicate logical lid: ${logical.lid}`);
    } else {
      logicalIds.add(logical.lid);
    }

    if (!Array.isArray(logical?.visualElementsParams)) {
      errors.push(`Logical element ${logical?.lid || '(unknown)'} has no visualElementsParams array.`);
      continue;
    }
    for (const visual of logical.visualElementsParams) {
      if (!visual?.id) {
        errors.push(`A visual for logical element ${logical?.lid || '(unknown)'} is missing id.`);
      } else if (visualIds.has(visual.id)) {
        errors.push(`Duplicate visual id: ${visual.id}`);
      } else {
        visualIds.add(visual.id);
        visuals.set(visual.id, { visual, logical });
      }
    }
  }

  const opdIds = new Set();
  const opdVisualIds = new Set();
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
      opdVisualIds.add(visualId);
    }
  }

  for (const [id, { visual, logical }] of visuals) {
    if (!opdVisualIds.has(id)) {
      errors.push(`Visual ${id} is not listed in any OPD.`);
    }
    if (logical.name === 'OpmLogicalState') {
      const parent = visuals.get(visual.fatherObjectId);
      if (!parent || parent.logical.name !== 'OpmLogicalObject') {
        errors.push(`State ${id} references missing object fatherObjectId ${visual.fatherObjectId}.`);
      } else if (!parent.visual.children?.includes(id)) {
        errors.push(`Parent object ${visual.fatherObjectId} does not list state ${visual.id} as a child.`);
      }
    }

    if (logical.name?.endsWith('Relation')) {
      const sourceId = visual.sourceVisualElement;
      if (!sourceId || !visualIds.has(sourceId)) {
        errors.push(`Relation ${id} references missing source ${sourceId || '(empty)'}.`);
      }
      if (!Array.isArray(visual.targetVisualElements) || visual.targetVisualElements.length === 0) {
        errors.push(`Relation ${id} has no targets.`);
      } else {
        for (const target of visual.targetVisualElements) {
          const targetId = target?.targetVisualElement;
          if (!targetId || !visualIds.has(targetId)) {
            errors.push(`Relation ${id} references missing target ${targetId || '(empty)'}.`);
          }
        }
      }
    }
  }

  const currentOpdId = model.currentOpd?.id;
  if (!currentOpdId) {
    errors.push('currentOpd.id is missing.');
  } else if (!opdIds.has(currentOpdId)) {
    errors.push(`currentOpd.id references missing OPD ${currentOpdId}.`);
  } else {
    const opd = model.opds.find((candidate) => candidate.id === currentOpdId);
    if (!Array.isArray(model.currentOpd.visualElements)) {
      errors.push('currentOpd.visualElements must be an array.');
    } else {
      const currentVisuals = new Set(model.currentOpd.visualElements);
      for (const id of currentVisuals) {
        if (!visualIds.has(id)) errors.push(`currentOpd references missing visual ${id}.`);
      }
      if (Array.isArray(opd.visualElements) &&
          (currentVisuals.size !== new Set(opd.visualElements).size ||
           opd.visualElements.some((id) => !currentVisuals.has(id)))) {
        errors.push(`currentOpd.visualElements does not match OPD ${currentOpdId}.`);
      }
    }
  }

  if (!model.name) warnings.push('Model name is empty.');
  return { valid: errors.length === 0, errors, warnings };
}

import { NATIVE_CLASSES, NATIVE_LINKS } from './modeling-guide.js';

const OBJECT = 'OpmLogicalObject';
const PROCESS = 'OpmLogicalProcess';
const STATE = 'OpmLogicalState';
const isObjectOrState = (element) => [OBJECT, STATE].includes(element?.name);
const isThing = (element) => [OBJECT, PROCESS].includes(element?.name);

function validEndpoints(type, source, target) {
  switch (type) {
    case 0: return source.name === OBJECT && target.name === PROCESS;
    case 1:
    case 2: return isObjectOrState(source) && target.name === PROCESS;
    case 3: return source.name === PROCESS && isObjectOrState(target);
    case 4: return (isObjectOrState(source) && target.name === PROCESS) ||
      (source.name === PROCESS && isObjectOrState(target));
    case 5: return source.name === PROCESS && target.name === PROCESS;
    case 11:
    case 13:
    case 14: return isThing(source) && isThing(target);
    case 12: return source.name === OBJECT && isThing(target);
    default: return true; // Unsupported types are rejected separately.
  }
}

export function validateOpcloudModel(model) {
  const errors = [];
  const warnings = [];
  const semanticChecks = [];
  const result = () => ({
    valid: errors.length === 0,
    errors, warnings, semanticChecks,
    validationScope: 'Supported OPCloud structure and partial OPM checks',
    isoConformance: 'not_assessed',
    requiresSemanticReview: semanticChecks.length > 0,
  });

  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    errors.push('Model must be a JSON object.');
    return result();
  }

  if (!Array.isArray(model.logicalElements)) errors.push('logicalElements must be an array.');
  if (!Array.isArray(model.opds)) errors.push('opds must be an array.');
  if (errors.length > 0) return result();
  if (model.opds.length === 0) errors.push('The model must contain at least one OPD.');

  const logicalIds = new Set();
  const visualIds = new Set();
  const visuals = new Map();
  for (const logical of model.logicalElements) {
    if (!NATIVE_CLASSES.includes(logical?.name)) {
      errors.push(`Unsupported native element class: ${logical?.name || '(missing)'}. Use opcloud_get_modeling_guide.`);
    }
    if ([OBJECT, PROCESS].includes(logical?.name)) {
      if (![0, 1].includes(logical.essence)) errors.push(`Thing ${logical.lid} has invalid essence.`);
      if (![0, 1].includes(logical.affiliation)) errors.push(`Thing ${logical.lid} has invalid affiliation.`);
    }
    if (['OpmProceduralRelation', 'OpmFundamentalRelation'].includes(logical?.name)) {
      const link = Number.isInteger(logical.linkType) ? NATIVE_LINKS[logical.linkType] : null;
      if (!link) errors.push(`Relation ${logical.lid} has unsupported linkType ${logical.linkType}; verify native support before extending the bridge registry.`);
      else if (logical.name !== link.family) errors.push(`Relation ${logical.lid} linkType ${logical.linkType} requires ${link.family}.`);
    }
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
  const containingOpds = new Map();
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
      if (!containingOpds.has(visualId)) containingOpds.set(visualId, []);
      containingOpds.get(visualId).push(opd);
    }
  }

  // Evidence can be in another OPD; do not confuse state suppression with statelessness.
  const objectStates = new Map();
  for (const { visual, logical } of visuals.values()) {
    if (logical.name !== STATE) continue;
    const parent = visuals.get(visual.fatherObjectId);
    if (parent?.logical.name !== OBJECT || !Array.isArray(parent.visual.children) || !parent.visual.children.includes(visual.id)) continue;
    if (!objectStates.has(parent.logical.lid)) objectStates.set(parent.logical.lid, new Set());
    objectStates.get(parent.logical.lid).add(logical.lid);
  }
  const stateOwners = new Map();
  for (const [id, { visual, logical }] of visuals) {
    if (!opdVisualIds.has(id)) {
      errors.push(`Visual ${id} is not listed in any OPD.`);
    }
    if (logical.name === 'OpmLogicalState') {
      const parent = visuals.get(visual.fatherObjectId);
      if (!parent || parent.logical.name !== 'OpmLogicalObject') {
        errors.push(`State ${id} references missing object fatherObjectId ${visual.fatherObjectId}.`);
      } else if (!Array.isArray(parent.visual.children) || !parent.visual.children.includes(id)) {
        errors.push(`Parent object ${visual.fatherObjectId} does not list state ${visual.id} as a child.`);
      }
      if (parent?.logical.name === OBJECT) {
        const owner = stateOwners.get(logical.lid);
        if (owner && owner !== parent.logical.lid) errors.push(`State ${logical.lid} belongs to different logical objects.`);
        stateOwners.set(logical.lid, parent.logical.lid);
        if ((containingOpds.get(id) || []).some((opd) => !opd.visualElements.includes(visual.fatherObjectId))) {
          errors.push(`State ${id} and its parent object must be in the same OPD.`);
        }
      }
    }
    if (isThing(logical)) {
      if (!Array.isArray(visual.children)) {
        errors.push(`Thing visual ${id} must have a children array.`);
      } else for (const childId of visual.children) {
        const child = visuals.get(childId);
        if (!child) errors.push(`Thing ${id} references missing child ${childId}.`);
        else if (child.logical.name === STATE && (logical.name !== OBJECT || child.visual.fatherObjectId !== id)) {
          errors.push(`State child ${childId} must belong to its corresponding object ${id}.`);
        }
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
          } else if (visuals.has(sourceId)) {
            const source = visuals.get(sourceId).logical;
            const destination = visuals.get(targetId).logical;
            if (!validEndpoints(logical.linkType, source, destination)) {
              errors.push(`Relation ${id} has invalid endpoint kinds or direction for linkType ${logical.linkType}.`);
            }
            if (logical.linkType === 0 && source.name === OBJECT) {
              if (source.essence !== 0) {
                errors.push(`[PROFILE-AGENT-PHYSICAL] Agent source ${sourceId} must be physical in this bridge profile.`);
              }
              warnings.push(`[ISO-3.4-AGENT-HUMAN] Confirm that ${sourceId} represents a human or group of humans; object names and affiliation do not prove this.`);
              semanticChecks.push({ ruleId: 'ISO-3.4-AGENT-HUMAN', clause: '3.4', relationId: logical.lid,
                objectId: source.lid, status: 'needs_review', check: 'Confirm human identity from the scenario; do not infer it from a label.' });
            }
            if (logical.linkType === 4 && validEndpoints(4, source, destination)) {
              const endpoint = source.name === PROCESS ? visuals.get(targetId) : visuals.get(sourceId);
              const affectee = endpoint.logical.name === STATE ? visuals.get(endpoint.visual.fatherObjectId)?.logical : endpoint.logical;
              if (affectee?.name === OBJECT) {
                const stateCount = objectStates.get(affectee.lid)?.size || 0;
                const opaqueStates = Array.isArray(affectee.statesWithoutVisual) && affectee.statesWithoutVisual.length > 0;
                if (!stateCount && !opaqueStates) {
                  errors.push(`[PROFILE-EFFECT-STATE-EVIDENCE] Effect ${id} has no owned native state evidence for ${affectee.lid}; provide a stateful object for ISO 19450:2024 3.3 review.`);
                }
                const evidence = stateCount ? 'owned_native_states' : opaqueStates ? 'unverified_suppressed_states' : 'missing';
                warnings.push(`[ISO-3.3-EFFECT-CHANGE] Review that Effect ${id} changes the same existing object's state. State evidence: ${evidence}; presence alone does not prove a valid transition.`);
                semanticChecks.push({ ruleId: 'ISO-3.3-EFFECT-CHANGE', clause: '3.3', relationId: logical.lid,
                  objectId: affectee.lid, status: 'needs_review', stateEvidence: evidence, stateCount,
                  check: 'Confirm statefulness and the actual change using the scenario and generated OPL.' });
              }
            }
            if ((containingOpds.get(id) || []).some((opd) => !opd.visualElements.includes(sourceId) || !opd.visualElements.includes(targetId))) {
              errors.push(`Relation ${id} and its endpoints must be in the same OPD.`);
            }
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
  return result();
}

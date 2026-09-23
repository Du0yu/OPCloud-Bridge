import { readFile } from 'node:fs/promises';

export const MODELING_INSTRUCTIONS = 'Before creating or changing an OPCloud model, call opcloud_get_modeling_guide and opcloud_get_model_template. Use only native Object, Process, State and supported native relations; preserve complete export structures and generate fresh UUIDs. Check opcloud_status, read and preserve the current model, validate before import, then review generated OPL and the actual diagram with opcloud_review_diagram. Do not claim ISO compliance or semantic validation from a successful import or reference check. These tools supply the rules even when the client cannot read this repository\'s AGENTS.md.';

export const NATIVE_CLASSES = Object.freeze([
  'OpmLogicalObject', 'OpmLogicalProcess', 'OpmLogicalState',
  'OpmProceduralRelation', 'OpmFundamentalRelation',
]);

// This is the bridge's supported subset, not an exhaustive list of all OPCloud types.
// Extend only after checking a native export and application behavior.
export const NATIVE_LINKS = Object.freeze({
  0: { name: 'Agent', family: 'OpmProceduralRelation' },
  1: { name: 'Instrument', family: 'OpmProceduralRelation' },
  2: { name: 'Consumption', family: 'OpmProceduralRelation' },
  3: { name: 'Result', family: 'OpmProceduralRelation' },
  4: { name: 'Effect', family: 'OpmProceduralRelation' },
  5: { name: 'Invocation', family: 'OpmProceduralRelation' },
  11: { name: 'Aggregation', family: 'OpmFundamentalRelation' },
  12: { name: 'Exhibition', family: 'OpmFundamentalRelation' },
  13: { name: 'Generalization', family: 'OpmFundamentalRelation' },
  14: { name: 'Instantiation', family: 'OpmFundamentalRelation' },
});

export async function getModelingGuide() {
  return {
    source: 'AGENTS.md',
    instructions: await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8'),
    standardsCoverage: {
      source: 'docs/iso-19450-2024-coverage.md',
      status: 'partial_checks_not_conformance_assessed',
      content: await readFile(new URL('../docs/iso-19450-2024-coverage.md', import.meta.url), 'utf8'),
    },
    templateTool: 'opcloud_get_model_template',
    usageNotes: 'The template tool supplies the repository example without requiring filesystem access. Clients unable to run repository commands must report those checks (including npm test) as not performed. Keep JSON/reference checks, import, rendering and OPL review distinct.',
    supportedClasses: NATIVE_CLASSES,
    supportedLinks: NATIVE_LINKS,
    validationScope: 'Checks supported element classes, link families and endpoint kinds, state ownership, references and bridge-profile Effect state evidence. Human Agent identity and actual Effect transitions require semantic review. Systemic human Agents are permitted. It does not establish domain semantics, layout quality, OPCloud import compatibility, or ISO compliance. Read semanticChecks even when valid is true. Unlisted native link types require verified support in the bridge before import.',
  };
}

export async function getModelTemplate() {
  return JSON.parse(await readFile(new URL('../examples/Two-Dish-Dinner-Corrected.opcl', import.meta.url), 'utf8'));
}

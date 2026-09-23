# ISO 19450:2024 rule coverage

Status: **partial checks; ISO conformance not assessed**. This is an implementation traceability record, not a certificate or a substitute for the standard. It applies to the MCP validator and modeling guide. Manual file import through the userscript has a separate, lighter validator.

## Evidence and limits

- Authoritative edition: [ISO 19450:2024](https://www.iso.org/standard/84612.html).
- Definitions 3.3 and 3.4 were inspected in the [2024 standard preview](https://cdn.standards.iteh.ai/samples/84612/fbeb6248f736438785e180262c1f6a53/ISO-19450-2024.pdf) during the review. Later retrieval attempts timed out; no complete licensed text was inspected. This repository contains original summaries, not a copy of the standard.
- Other clause numbers below come from that preview's table of contents. A heading establishes scope, not the detailed normative requirements. Those rows remain pending full-text review.
- OPCloud class names, numeric link types, JSON fields, UUIDs and serialization checks are implementation details verified against the repository's canonical export. They are not claimed to be ISO-prescribed encodings.

## Clause → rule → implementation → test

| Reference / evidence | Project rule | Implementation | Verification and remaining work |
|---|---|---|---|
| 3.4 Agent — definition inspected | Agent denotes a human or human group; autonomy alone is insufficient. | AGENTS.md Agent rule; `ISO-3.4-AGENT-HUMAN` review finding in `model-validation.js`. | `test-iso-rules.js`: human-looking and robot-looking labels both require scenario review. No name heuristic claims to determine humanity. |
| 3.3 Affectee — definition inspected | Effect represents a change in the state of an existing object. | `ISO-3.3-EFFECT-CHANGE` review finding; state evidence lookup across all visual representations of an object. | `test-iso-rules.js`: object/state endpoints, reverse Effect direction, evidence in another OPD. The actual meaning of the change still needs OPL/scenario review. |
| Bridge profile derived from the preceding definition | Require serialized owned state evidence for Effect. If none exists, reject the unsupported model representation. Preserve opaque suppressed-state records and flag them for review. | `PROFILE-EFFECT-STATE-EVIDENCE`, `objectStates` lookup in `model-validation.js`. | `test-iso-rules.js`: absent states rejected; unverified `statesWithoutVisual` produces a review finding, never verified evidence. This conservative import policy is not a claim that ISO requires states to be drawn in every OPD. |
| Bridge profile; not a quoted ISO requirement | Represent human Agent sources as physical. Systemic and environmental affiliations are both accepted. | `PROFILE-AGENT-PHYSICAL`; no environmental-only rejection. | `test-iso-rules.js`: systemic accepted; informatical rejected by the profile; human identity remains unverified. |
| 5 Conformance — heading only | Do not claim conformance from structural validity or successful import. | Every validation response has `isoConformance: "not_assessed"`; guide communicates limitations. | Unit and MCP integration tests inspect this field. Full clause requirements and an assessment procedure remain to be reviewed. |
| 7.3.5 Object states — heading only | Check parent Object, reciprocal children, same-diagram placement and consistent logical ownership. | Native-reference checks in `model-validation.js`. | `test-model-validation.js`; additional full-text semantic mapping pending. These serialization checks alone do not establish clause compliance. |
| 8 and 9 Procedural links — headings only | Check supported endpoint kinds, link family and direction. | `validEndpoints`, `NATIVE_LINKS`. | Existing validation tests cover malformed endpoints and types. Uniqueness, control/event/condition behavior and all state-specified forms are not fully checked. |
| 9.4.1 State-specified agent link — heading only | Do not guess native serialization. | Current Agent endpoint profile accepts Object → Process only. | Native state-specified Agent exports and normative requirements must be verified before extending support. The current subset is not complete OPM support. |
| 10 Structural links — headings only | Accept only the bridge's registered native families/types. | `NATIVE_LINKS` currently includes 11–14. | Endpoint tests do not validate all specialization, instantiation or aggregation semantics. Tagged structural links and state-specified structural forms require further verified native support. |
| OPCloud export contract, not an ISO clause | Preserve complete exports, unique IDs and resolvable references. | `model-validation.js`, complete template tool. | `test-model-validation.js`, `test-mcp-bridge.js`; successful validation is distinct from live import/rendering. |
| Project review workflow; full normative mapping pending | Check native rendering and OPCloud-generated OPL against the intended scenario. | `opcloud_review_diagram`, AGENTS.md workflow. | A reviewer must inspect the actual diagram/OPL. Automated structural tests are not evidence that this review occurred. |

Code: [validator](../mcp-server/model-validation.js), [guide](../mcp-server/modeling-guide.js).
Tests: [ISO rule checks](../scripts/test-iso-rules.js), [structural checks](../scripts/test-model-validation.js), [MCP integration](../scripts/test-mcp-bridge.js).

## Reading the validation result

`valid` means the implemented error checks passed. `warnings` and `semanticChecks` retain unresolved review items even when `valid` is true. `owned_native_states` reports structural evidence only; `unverified_suppressed_states` reports opaque data requiring review. Neither verifies a real state transition. `isoConformance` stays `not_assessed`, including for empty or invalid input.

## Remaining assessment work

Obtain lawful access to the full 2024 text, review clause 5 and the applicable normative requirements, and replace pending rows with precise checks and evidence. Extend the registry only with verified OPCloud exports. Add positive/negative model cases, run live import/rendering and OPL review, and record manual decisions about human identity, system boundaries and transformations. Do not infer complete conformity from the two definitions already inspected, and do not silently substitute the withdrawn 2015 edition.

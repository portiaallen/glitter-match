export {
  ANCHOR_POLICIES,
  CASCADE_TERMINATIONS,
  CANDIDATE_CREATION_POLICIES,
  CONSUMPTION_POLICIES,
  CREATION_CELL_POLICIES,
  DEFAULT_CASCADE_LIMITS,
  SPECIAL_MATCH_CATEGORIES,
  SPECIAL_MATCH_EVENT_KINDS,
  SPECIAL_MATCH_LIFECYCLE,
  SPECIAL_MATCH_TRIGGERS,
  SPECIAL_MATCH_TYPE_IDS,
  cueForSpecial,
  defaultSpecialAccessibility,
  type AnchorPolicy,
  type CandidateCreationPolicy,
  type CascadeSafetyLimits,
  type CascadeTermination,
  type ConsumptionPolicy,
  type CreationCellPolicy,
  type SpecialMatchAccessibility,
  type SpecialMatchActivation,
  type SpecialMatchCategory,
  type SpecialMatchDiagnostics,
  type SpecialMatchEvent,
  type SpecialMatchEventKind,
  type SpecialMatchExplanation,
  type SpecialMatchInstance,
  type SpecialMatchLifecycle,
  type SpecialMatchTrigger,
  type SpecialMatchTypeId,
} from "./types.js";
export { selectAnchor } from "./anchors.js";
export { SpecialMatchRegistry, validateSpecialMatchType, type SpecialMatchTypeDefinition } from "./registry.js";
export { BUILT_IN_SPECIAL_MATCH_TYPES } from "./catalog.js";
export {
  createSpecialMatchRuntime,
  cloneSpecialMatchRuntime,
  serializeSpecialMatchRuntime,
  compareSpecialMatchRuntime,
  type SpecialMatchRuntime,
} from "./runtime.js";
export { resolveCandidateCreation, type CreationDecision } from "./creation.js";
export {
  adoptBoard,
  compareActivations,
  queueActivation,
  collectMatchTriggers,
  resolvePendingActivations,
} from "./activation.js";
export { createSpecialMatchRegistry, getDefaultSpecialMatchRegistry } from "./cascade.js";
export {
  createSpecialInteractionRegistry,
  SpecialInteractionRegistry,
  DEFAULT_SPECIAL_INTERACTIONS,
} from "./interactions.js";
export { applyObstacleSpecialResponses } from "./obstacles.js";
export { validateSpecialMatchState, validateCascadeLimits } from "./validate.js";
export {
  serializeSpecialMatchState,
  canonicalSpecialMatchState,
  gameplayFingerprint,
  specialMatchStatesEqual,
} from "./serialize.js";
export { explainSpecialMatch, explainActivation, explainCascade, explainRuntime } from "./explain.js";
export { inspectSpecialMatches, inspectActivation, labActivateSpecial, type SpecialMatchInspection } from "./inspect.js";
export { SPECIAL_MATCH_FIXTURE_FILES, SPECIAL_MATCH_FIXTURE_IDS, type SpecialMatchFixtureId } from "./fixtures.js";

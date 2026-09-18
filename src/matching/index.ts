export { iconsCompatible, isGlitter, groupColor } from "./compatibility.js";
export { detectMatches, matchedCellIds } from "./detect.js";
export {
  defaultMatchRules,
  defaultSearchBounds,
  DEFAULT_MATCH_MODES,
  DEFAULT_SEARCH_BOUNDS,
  DIRECTION_ROTATION_VOCABULARY,
  MATCH_MODES,
  OVERLAP_POLICIES,
  PATTERN_IDS,
  PATTERN_SYMMETRIES,
  STANDARD_DIRECTION_LABELS,
  type MatchAccessibility,
  type MatchDetectionContext,
  type MatchEvent,
  type MatchEventKind,
  type MatchExplain,
  type MatchGroup,
  type MatchMode,
  type MatchResolution,
  type MatchRules,
  type MatchSearchBounds,
  type OccupantIdentity,
  type OverlapPolicy,
  type OverlapRecord,
  type PatternId,
  type PatternSymmetry,
  type SpecialMatchCandidate,
} from "./types.js";
export {
  createMatchRuleRegistry,
  MATCH_CONTRACT_CATALOG,
  MATCH_CONTRACT_IDS,
  MatchRuleRegistry,
  type MatchContractDefinition,
  type MatchContractId,
} from "./contracts.js";
export {
  BUILT_IN_MATCH_ENGINE_RULES,
  createMatchEngineRuleRegistry,
  MATCH_ENGINE_RULE_IDS,
  MatchEngineRuleRegistry,
  validateMatchEngineRule,
  type MatchEngineRule,
  type MatchEngineRuleId,
} from "./engine.js";
export {
  createPatternRegistry,
  PatternRegistry,
  type PatternDefinition,
  type PatternHandler,
  type PatternHit,
  type PatternSearchContext,
} from "./patterns.js";
export {
  createMatchEngine,
  getDefaultMatchEngine,
  parseMatchResolution,
  resolveOverlaps,
  runMatchResolution,
  serializeMatchResolution,
  whyCandidateFailed,
  whyMatchCount,
  type MatchEngine,
} from "./pipeline.js";
export {
  createWildcardRegistry,
  glitterMayJoin,
  UNIVERSAL_GLITTER_WILDCARD,
  UNIVERSAL_GLITTER_WILDCARD_ID,
  WildcardRegistry,
  type WildcardContract,
} from "./wildcard.js";
export {
  ALLOWED_CELL_STATES,
  ALLOWED_OCCUPANT_STATES,
  canJoinIconSequence,
  canParticipate,
  iconAt,
  matchableIcon,
} from "./occupancy.js";
export { beginWalk, walkSameDirection, type PatternWalk } from "./walk.js";
export {
  MATCH_ENGINE_FIXTURE_FILES,
  MATCH_ENGINE_FIXTURE_IDS,
  type MatchEngineFixtureId,
} from "./fixtures.js";

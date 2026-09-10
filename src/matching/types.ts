export const MATCH_MODES = ["cluster", "aligned", "corner", "tee", "cross", "path", "cycle"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

/** Default lab/document modes. Path and cycle stay opt-in so irregular fixtures do not grow extra groups. */
export const DEFAULT_MATCH_MODES = ["cluster", "aligned", "corner", "tee", "cross"] as const satisfies readonly MatchMode[];

export const OVERLAP_POLICIES = ["keep-all", "prefer-largest", "prefer-special-priority"] as const;
export type OverlapPolicy = (typeof OVERLAP_POLICIES)[number];

export const PATTERN_SYMMETRIES = [
  "none",
  "horizontal",
  "vertical",
  "rotational",
  "reflective",
  "graph-defined",
] as const;
export type PatternSymmetry = (typeof PATTERN_SYMMETRIES)[number];

export const PATTERN_IDS = [
  "straight",
  "L",
  "T",
  "cross",
  "path",
  "cluster",
  "ring",
  "directional-sequence",
  "authored",
] as const;
export type PatternId = (typeof PATTERN_IDS)[number];

/** Standardized compass vocabulary. Authored edges may use these labels; they are never inferred from x/y. */
export const STANDARD_DIRECTION_LABELS = ["n", "e", "s", "w"] as const;
export type StandardDirectionLabel = (typeof STANDARD_DIRECTION_LABELS)[number];

/** Logical rotation vocabulary from earlier prompts. Not screen geometry. */
export const DIRECTION_ROTATION_VOCABULARY = "n → e → s → w → n" as const;

export const DEFAULT_SEARCH_BOUNDS = {
  maxWalks: 256,
  maxCycleLength: 12,
  maxPathLength: 12,
  maxVisitedPerWalk: 64,
  maxFailuresRecorded: 32,
} as const;

export type MatchSearchBounds = {
  maxWalks: number;
  maxCycleLength: number;
  maxPathLength: number;
  maxVisitedPerWalk: number;
  maxFailuresRecorded: number;
};

export interface MatchRules {
  minGroupSize: number;
  modes: MatchMode[];
  /** Author-facing contract ids from MatchRuleRegistry. */
  contracts?: string[];
  /** Optional explicit engine rule ids. When omitted, modes select built-in rules. */
  ruleIds?: string[];
  overlapPolicy?: OverlapPolicy;
  searchBounds?: Partial<MatchSearchBounds>;
}

export function defaultMatchRules(): MatchRules {
  return { minGroupSize: 3, modes: ["cluster"] };
}

export function defaultSearchBounds(overrides?: Partial<MatchSearchBounds>): MatchSearchBounds {
  return { ...DEFAULT_SEARCH_BOUNDS, ...overrides };
}

export interface OccupantIdentity {
  cellId: string;
  iconId: string;
}

export interface SpecialMatchCandidate {
  candidateType: string;
  affectedCellIds: string[];
  anchorCellId: string;
  triggerMove: MatchTriggerMove | null;
  ruleId: string;
  priority: number;
}

export interface MatchTriggerMove {
  from: string;
  to: string;
}

export interface MatchAccessibility {
  matchType: string;
  matchedCells: string[];
  patternExplanation: string;
  stateChanges: string;
  nonColorIndicator: string;
  audioCue?: string;
  hapticCue?: string;
}

export interface MatchCompatibilityDecision {
  cellId: string;
  iconId: string;
  accepted: boolean;
  reason: string;
}

export interface MatchEdgeStep {
  from: string;
  to: string;
  direction?: string;
}

export interface MatchExplain {
  ruleId: string;
  patternId?: string;
  startingCell: string | null;
  traversedCells: string[];
  edgesTraversed: MatchEdgeStep[];
  directionsUsed: string[];
  occupantCompatibility: MatchCompatibilityDecision[];
  rejectedCandidates: Array<{ cellId: string; reason: string }>;
  finalMatchedCells: string[];
  outcome: "matched" | "failed";
  summary: string;
}

export interface MatchGroup {
  cellIds: string[];
  colorIconId: string;
  mode: MatchMode;
  /** Present when an aligned/pattern mode produced the group. */
  pattern?: "line" | "corner" | "tee" | "cross" | "cluster" | "path" | "cycle";
  groupId?: string;
  ruleId?: string;
  occupantIdentities?: OccupantIdentity[];
  patternMetadata?: Record<string, unknown>;
  triggerMove?: MatchTriggerMove | null;
  cascadeIndex?: number;
  specialMatchCandidate?: SpecialMatchCandidate | null;
  explain?: MatchExplain;
  accessibility?: MatchAccessibility;
}

export interface MatchDetectionContext {
  triggerMove?: MatchTriggerMove | null;
  cascadeIndex?: number;
}

export type MatchEventKind =
  | "match-detected"
  | "match-group-created"
  | "pattern-recognized"
  | "overlap-resolved"
  | "special-match-candidate-created"
  | "matched-cells-marked"
  | "match-resolution-complete";

export interface MatchEvent {
  kind: MatchEventKind;
  groupId?: string;
  ruleId?: string;
  cellIds?: string[];
  patternId?: string;
  message: string;
  accessibility: MatchAccessibility;
  data?: Record<string, unknown>;
}

export interface OverlapRecord {
  cellId: string;
  groupIds: string[];
  policy: OverlapPolicy;
  keptGroupIds: string[];
  deferredGroupIds: string[];
}

export interface MatchSearchStats {
  walks: number;
  truncated: boolean;
  bounds: MatchSearchBounds;
}

export interface MatchResolution {
  groups: MatchGroup[];
  markedCellIds: string[];
  specialMatchCandidates: SpecialMatchCandidate[];
  overlaps: OverlapRecord[];
  events: MatchEvent[];
  explanations: MatchExplain[];
  failures: MatchExplain[];
  search: MatchSearchStats;
}

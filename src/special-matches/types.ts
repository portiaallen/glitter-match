import type { CellId } from "../ids.js";
import type { SpecialMatchCandidate } from "../matching/types.js";
import type { AccessibilityCue, PrimitiveEffect, PrimitiveEvent } from "../primitives/index.js";

export const SPECIAL_MATCH_CATEGORIES = ["line-clear", "area-clear", "cross-clear"] as const;
export type SpecialMatchCategory = (typeof SPECIAL_MATCH_CATEGORIES)[number];

export const SPECIAL_MATCH_TYPE_IDS = ["line-clear", "area-clear", "cross-clear"] as const;
export type SpecialMatchTypeId = (typeof SPECIAL_MATCH_TYPE_IDS)[number];

export const ANCHOR_POLICIES = [
  "authored-candidate",
  "canonical-cell",
  "match-created",
  "rule-selector",
] as const;
export type AnchorPolicy = (typeof ANCHOR_POLICIES)[number];

export const CREATION_CELL_POLICIES = ["preserve-anchor", "clear-all", "preserve-all-matched"] as const;
export type CreationCellPolicy = (typeof CREATION_CELL_POLICIES)[number];

export const CANDIDATE_CREATION_POLICIES = ["priority-unique-anchors", "all-non-overlapping"] as const;
export type CandidateCreationPolicy = (typeof CANDIDATE_CREATION_POLICIES)[number];

export const SPECIAL_MATCH_TRIGGERS = [
  "direct",
  "matched",
  "adjacent-match",
  "struck",
  "cascade",
  "topology",
  "mechanic",
] as const;
export type SpecialMatchTrigger = (typeof SPECIAL_MATCH_TRIGGERS)[number];

export const SPECIAL_MATCH_LIFECYCLE = [
  "created",
  "armed",
  "triggered",
  "resolving",
  "resolved",
  "cancelled",
] as const;
export type SpecialMatchLifecycle = (typeof SPECIAL_MATCH_LIFECYCLE)[number];

export const CONSUMPTION_POLICIES = ["consumed", "remain", "transform", "replace", "inactive"] as const;
export type ConsumptionPolicy = (typeof CONSUMPTION_POLICIES)[number];

export const CASCADE_TERMINATIONS = [
  "CASCADE_COMPLETED",
  "CASCADE_LIMIT_REACHED",
  "CASCADE_STATE_REPEAT",
  "CASCADE_INVALID",
] as const;
export type CascadeTermination = (typeof CASCADE_TERMINATIONS)[number];

export const SPECIAL_MATCH_EVENT_KINDS = [
  "SPECIAL_CANDIDATE_IDENTIFIED",
  "SPECIAL_CANDIDATE_DEFERRED",
  "SPECIAL_MATCH_CREATED",
  "SPECIAL_MATCH_TRIGGERED",
  "SPECIAL_MATCH_ACTIVATED",
  "SPECIAL_MATCH_EFFECT_EMITTED",
  "SPECIAL_MATCH_CONSUMED",
  "SPECIAL_MATCH_RESOLVED",
  "SPECIAL_MATCH_CANCELLED",
  "SPECIAL_INTERACTION_RESOLVED",
  "CASCADE_STEP",
  "CASCADE_COMPLETED",
  "CASCADE_LIMIT_REACHED",
  "CASCADE_STATE_REPEAT",
  "CASCADE_INVALID",
] as const;
export type SpecialMatchEventKind = (typeof SPECIAL_MATCH_EVENT_KINDS)[number];

export interface SpecialMatchAccessibility {
  label: string;
  description: string;
  nonColorIndicator: string;
  patternId: string;
  highContrast: string;
  reducedMotion: string;
  audioCue?: string;
  hapticCue?: string;
}

export interface SpecialMatchInstance {
  instanceId: string;
  typeId: string;
  typeVersion: string;
  anchorCellId: CellId;
  sourceMatchGroupId: string;
  createdAtMove: number;
  createdAtCombo: number;
  state: SpecialMatchLifecycle;
  activationState: SpecialMatchLifecycle;
  metadata: {
    candidateType: string;
    affectedCellIds: CellId[];
    directionsUsed: string[];
    ruleId: string;
    category: SpecialMatchCategory | string;
  };
}

export interface SpecialMatchActivation {
  activationId: string;
  instanceId: string;
  trigger: SpecialMatchTrigger;
  sequence: number;
  createdAtMove: number;
  priority: number;
  anchorCellId: CellId;
}

export interface SpecialMatchEvent {
  kind: SpecialMatchEventKind;
  activationId?: string;
  instanceId?: string;
  candidateType?: string;
  cellIds?: CellId[];
  message: string;
  explain: SpecialMatchExplanation;
  data?: Record<string, unknown>;
}

export interface SpecialMatchExplanation {
  whyCreated?: string;
  whyAnchor?: string;
  sourceGroupId?: string;
  candidatesConsidered?: SpecialMatchCandidate[];
  policyWinner?: string;
  whyActivated?: string;
  effects?: PrimitiveEffect[];
  affectedCells?: CellId[];
  affectedEdges?: string[];
  whyCascadeContinued?: string;
  whyCascadeStopped?: string;
  accessibility: SpecialMatchAccessibility;
}

export interface CascadeSafetyLimits {
  maxCombos: number;
  maxDepth: number;
  maxEffects: number;
  maxEvents: number;
  maxActivations: number;
}

export const DEFAULT_CASCADE_LIMITS: CascadeSafetyLimits = {
  maxCombos: 64,
  maxDepth: 64,
  maxEffects: 256,
  maxEvents: 512,
  maxActivations: 64,
};

export interface SpecialMatchDiagnostics {
  eventCount: number;
  effectCount: number;
  cascadeDepth: number;
  activationCount: number;
  boardMutationCount: number;
  durationMs: number;
}

export interface SpecialObstacleResponse {
  action: "apply" | "block" | "weaken" | "unlock" | "reveal" | "redirect" | "ignore";
  durabilityDelta?: number;
}

export function defaultSpecialAccessibility(typeId: string, anchor: string): SpecialMatchAccessibility {
  return {
    label: `${typeId} Special Match at cell ${anchor}`,
    description: `Board Special Match of type ${typeId} occupying ${anchor}. Not an inventory Special Icon.`,
    nonColorIndicator: `SM:${typeId}:${anchor}`,
    patternId: typeId,
    highContrast: `SM ${typeId}`,
    reducedMotion: "State snaps; animation is presentation only.",
    audioCue: `special.${typeId}`,
    hapticCue: `special.${typeId}`,
  };
}

export function cueForSpecial(typeId: string, announcement: string): AccessibilityCue {
  return {
    announcement,
    audioId: `special.${typeId}`,
    hapticId: `special.${typeId}`,
    reducedMotionAlternative: announcement,
    highContrastIndicator: `SM ${typeId}`,
  };
}

export type { PrimitiveEvent };

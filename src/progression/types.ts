import type { LandId, LevelId } from "../ids.js";
import { COMPOSITION_OPS, type CompositionOp } from "../objectives/types.js";

export { COMPOSITION_OPS, type CompositionOp };

export const PROGRESSION_SCHEMA_VERSION = "10.0.0" as const;

export const AVAILABILITY_STATES = ["UNAVAILABLE", "LOCKED", "AVAILABLE"] as const;
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number];

export const PLAY_STATES = ["NOT_STARTED", "IN_PROGRESS", "ABANDONED"] as const;
export type PlayState = (typeof PLAY_STATES)[number];

export const MASTERY_STATES = ["NOT_ATTEMPTED", "NOT_MASTERED", "MASTERED"] as const;
export type MasteryState = (typeof MASTERY_STATES)[number];

export const VERSION_COMPATIBILITY = ["VALID", "STALE", "INVALIDATED", "UNKNOWN"] as const;
export type VersionCompatibility = (typeof VERSION_COMPATIBILITY)[number];

export const ATTEMPT_OUTCOMES = ["in-progress", "completed", "failed", "abandoned"] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

export const NODE_KINDS = [
  "campaign-level",
  "finale",
  "post-campaign",
  "event",
  "challenge",
  "adaptive",
  "gate-experience",
  "story",
] as const;
export type ProgressionNodeKind = (typeof NODE_KINDS)[number];

export const LAND_COMPLETION_POLICIES = [
  "ALL_REQUIRED_LEVELS",
  "REQUIRED_THRESHOLD",
  "FINALE_COMPLETION",
  "CUSTOM_REGISTERED_POLICY",
] as const;
export type LandCompletionPolicy = (typeof LAND_COMPLETION_POLICIES)[number];

export const BEST_RESULT_STRATEGIES = ["higher-score", "fewer-moves", "mastery-then-score"] as const;
export type BestResultStrategy = (typeof BEST_RESULT_STRATEGIES)[number];

export const PROGRESSION_EVENT_KINDS = [
  "LEVEL_UNLOCKED",
  "LEVEL_STARTED",
  "LEVEL_ATTEMPTED",
  "LEVEL_COMPLETED",
  "LEVEL_FAILED",
  "LEVEL_MASTERED",
  "BEST_RESULT_UPDATED",
  "LAND_PROGRESS_UPDATED",
  "PACK_PROGRESS_UPDATED",
  "CAMPAIGN_PROGRESS_UPDATED",
  "PROGRESSION_MILESTONE_REACHED",
  "GATE_UNLOCKED",
  "GATE_COMPLETED",
  "GATE_DECISION_MADE",
  "GATE_EXPERIENCE_RECORDED",
] as const;
export type ProgressionEventKind = (typeof PROGRESSION_EVENT_KINDS)[number];

export const VIEW_STATUSES = ["UNAVAILABLE", "LOCKED", "AVAILABLE", "IN_PROGRESS", "COMPLETED", "MASTERED"] as const;
export type ProgressionViewStatus = (typeof VIEW_STATUSES)[number];

/** Canonical, stable, version-aware level identity. Never array position. */
export interface LevelReference {
  universeId: string;
  landId: string;
  packId: string;
  levelId: LevelId;
}

export interface UnlockCondition {
  op: CompositionOp | "count" | "always" | "level-completed" | "level-mastered" | "pack-completed" | "land-completed" | "event";
  levelId?: string;
  packId?: string;
  landId?: string;
  eventKind?: string;
  threshold?: number;
  children?: UnlockCondition[];
}

export interface ProgressionEdge {
  from: string;
  to: string;
  condition?: UnlockCondition;
}

export interface ProgressionNode {
  id: string;
  version: string;
  kind: ProgressionNodeKind;
  landId: string;
  packId: string;
  required: boolean;
  unlock: UnlockCondition;
  bestResultStrategy?: BestResultStrategy;
  masteryVersion?: string;
  accessibilityLabel: string;
  purpose: "engine-fixture" | "campaign";
}

export interface LevelPackContent {
  id: string;
  version: string;
  universeId: string;
  landId: string;
  title: string;
  purpose: "engine-fixture" | "campaign";
  nodeIds: string[];
  edges: ProgressionEdge[];
  landCompletionPolicy?: LandCompletionPolicy;
  requiredThreshold?: number;
  notes?: string;
}

export interface LandProgressionContent {
  landId: string;
  packIds: string[];
  completionPolicy: LandCompletionPolicy;
  requiredThreshold?: number;
  finaleNodeId?: string;
}

export interface UniverseContent {
  id: string;
  version: string;
  title: string;
  purpose: "engine-fixture" | "campaign";
  landIds: string[];
  packs: LevelPackContent[];
  lands: LandProgressionContent[];
  notes?: string;
}

export interface ReplayReference {
  seed?: string;
  contentVersion: string;
  moveCount: number;
}

export interface AttemptRecord {
  attemptId: string;
  levelId: LevelId;
  contentVersion: string;
  seed?: string;
  moveCount: number;
  score: number;
  outcome: AttemptOutcome;
  completed: boolean;
  mastered: boolean;
  replayRef?: ReplayReference;
}

export interface CompletionRecord {
  levelId: LevelId;
  completed: boolean;
  completionCount: number;
  firstCompletedAttemptId?: string;
  lastCompletedAttemptId?: string;
  contentVersion?: string;
}

export interface BestResult {
  attemptId: string;
  strategy: BestResultStrategy;
  score: number;
  movesUsed: number;
  mastered: boolean;
  contentVersion: string;
}

export interface MasteryRecord {
  state: MasteryState;
  mastered: boolean;
  contentVersion?: string;
  masteryVersion?: string;
}

export interface LevelProgressState {
  levelId: LevelId;
  contentVersion: string;
  availability: AvailabilityState;
  play: PlayState;
  completion: CompletionRecord;
  mastery: MasteryRecord;
  best?: BestResult;
  currentAttemptId?: string;
  attemptIds: string[];
  versionCompatibility: VersionCompatibility;
}

export interface ProgressionEvent {
  id: string;
  kind: ProgressionEventKind;
  sequence: number;
  levelId?: LevelId;
  landId?: string;
  packId?: string;
  attemptId?: string;
  message: string;
}

export interface PlayerProgression {
  version: string;
  unlockedLandIds: LandId[] | string[];
  completedLevelIds: LevelId[];
  starsByLevel: Record<LevelId, number>;
  levels: Record<LevelId, LevelProgressState>;
  attempts: Record<string, AttemptRecord>;
  events: ProgressionEvent[];
  processedEventIds: string[];
  sequence: number;
}

export interface ProgressionAccessibility {
  label: string;
  statusText: string;
  nonColorIndicator: string;
  highContrast: string;
  reducedMotion: string;
  audioCue?: string;
  hapticCue?: string;
}

export function levelRefKey(ref: LevelReference): string {
  return `${ref.universeId}/${ref.landId}/${ref.packId}/${ref.levelId}`;
}

export function defaultProgressionAccessibility(status: ProgressionViewStatus, label: string): ProgressionAccessibility {
  return {
    label,
    statusText: status.replaceAll("_", " ").toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase()),
    nonColorIndicator: `PROG:${status}`,
    highContrast: status,
    reducedMotion: "Progression status is text; animation is presentation only.",
    audioCue: `progression.${status.toLowerCase()}`,
    hapticCue: `progression.${status.toLowerCase()}`,
  };
}

export function viewStatus(state: LevelProgressState | undefined): ProgressionViewStatus {
  if (!state) {
    return "UNAVAILABLE";
  }
  if (state.availability === "UNAVAILABLE") {
    return "UNAVAILABLE";
  }
  if (state.availability === "LOCKED") {
    return "LOCKED";
  }
  if (state.mastery.mastered) {
    return "MASTERED";
  }
  if (state.completion.completed) {
    return "COMPLETED";
  }
  if (state.play === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }
  return "AVAILABLE";
}

import type { CellId } from "../ids.js";
import type { Board } from "../board/index.js";
import type { GameStats, ObjectiveDefinition, ObjectiveProgress } from "./model.js";

export const OBJECTIVE_STATUSES = ["INCOMPLETE", "COMPLETE", "FAILED"] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];

export const WIN_STATES = ["IN_PROGRESS", "COMPLETED", "FAILED"] as const;
export type WinState = (typeof WIN_STATES)[number];

export const OBJECTIVE_ROLES = ["required", "optional", "mastery"] as const;
export type ObjectiveRole = (typeof OBJECTIVE_ROLES)[number];

export const COUNT_UNITS = [
  "icon",
  "cell",
  "match-group",
  "cascade",
  "activation",
  "move",
  "score",
  "event",
  "unique-target",
  "board-state",
  "stage",
] as const;
export type CountUnit = (typeof COUNT_UNITS)[number];

export const TARGET_KINDS = ["icon", "cell", "artifact", "state", "event"] as const;
export type TargetKind = (typeof TARGET_KINDS)[number];

export const COMPOSITION_OPS = ["and", "or", "sequence", "not"] as const;
export type CompositionOp = (typeof COMPOSITION_OPS)[number];

export const COMPLETION_POLICIES = [
  "ALL_REQUIRED_OBJECTIVES",
  "ANY_REQUIRED_OBJECTIVE",
  "SEQUENCE_COMPLETE",
  "CUSTOM_REGISTERED_POLICY",
] as const;
export type CompletionPolicy = (typeof COMPLETION_POLICIES)[number];

export const FAILURE_POLICIES = [
  "NONE",
  "ANY_FAILURE",
  "ALL_FAILURES",
  "MOVE_LIMIT",
  "REGISTERED_FAILURE_CONDITION",
] as const;
export type FailurePolicy = (typeof FAILURE_POLICIES)[number];

export const CONFLICT_POLICIES = ["completion-first", "failure-first"] as const;
export type ConflictPolicy = (typeof CONFLICT_POLICIES)[number];

export const EVALUATION_PHASES = [
  "before-move",
  "after-move",
  "after-match-resolution",
  "after-special-resolution",
  "after-cascade",
  "after-board-settlement",
  "after-objective-event",
  "end-of-turn",
  "level-evaluation",
] as const;
export type EvaluationPhase = (typeof EVALUATION_PHASES)[number];

export const OBJECTIVE_EVENT_KINDS = [
  "MOVE_STARTED",
  "MOVE_COMPLETED",
  "MATCH_DETECTED",
  "MATCH_RESOLVED",
  "CELL_CLEARED",
  "OBSTACLE_CHANGED",
  "SPECIAL_MATCH_CREATED",
  "SPECIAL_MATCH_ACTIVATED",
  "SPECIAL_MATCH_RESOLVED",
  "CASCADE_STARTED",
  "CASCADE_STEP",
  "CASCADE_COMPLETED",
  "TOPOLOGY_CHANGED",
  "SCORE_CHANGED",
  "DISCOVERY_OCCURRED",
  "REGISTERED_COMBO",
  "OBJECTIVE_PROGRESS_CHANGED",
] as const;
export type ObjectiveEventKind = (typeof OBJECTIVE_EVENT_KINDS)[number];

export interface ObjectiveAccessibility {
  label: string;
  progressText: string;
  statusText: string;
  nonColorIndicator: string;
  highContrast: string;
  reducedMotion: string;
  audioCue?: string;
  hapticCue?: string;
}

export interface ObjectiveEvent {
  kind: ObjectiveEventKind;
  sequence: number;
  phase: EvaluationPhase;
  cellIds?: CellId[];
  iconId?: string;
  amount?: number;
  combo?: number;
  instanceId?: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ObjectiveState {
  objectiveId: string;
  objectiveVersion: string;
  type: string;
  role: ObjectiveRole;
  status: ObjectiveStatus;
  current: number;
  target: number;
  previous: number;
  activeStageId?: string;
  counters: Record<string, number>;
  seenKeys: string[];
  lastEventKind?: ObjectiveEventKind;
  lastReason?: string;
  metadata: Record<string, string>;
}

export interface WinStateConfig {
  completionPolicy: CompletionPolicy;
  failurePolicy: FailurePolicy;
  conflictPolicy: ConflictPolicy;
}

export const DEFAULT_WIN_STATE_CONFIG: WinStateConfig = {
  completionPolicy: "ALL_REQUIRED_OBJECTIVES",
  failurePolicy: "MOVE_LIMIT",
  conflictPolicy: "completion-first",
};

export interface WinStateResult {
  state: WinState;
  complete: boolean;
  failed: boolean;
  whyComplete?: string;
  whyIncomplete?: string;
  whyFailed?: string;
  remainingRequired: string[];
  satisfiedRequired: string[];
  optionalComplete: string[];
  failedIds: string[];
  policy: WinStateConfig;
}

export interface ObjectiveEvaluationContext {
  stats: GameStats;
  movesRemaining: number | null;
  moveLimit?: number | null;
  occupiedIcons: Record<CellId, string | null>;
  hiddenCellIds: CellId[];
  board?: Board;
  phase?: EvaluationPhase;
  events?: ObjectiveEvent[];
}

export interface HandlerResult {
  current: number;
  target: number;
  status: ObjectiveStatus;
  label: string;
  reason: string;
  counters?: Record<string, number>;
  seenKeys?: string[];
  activeStageId?: string;
}

export function progressToStatus(progress: ObjectiveProgress): ObjectiveStatus {
  if (progress.failed) {
    return "FAILED";
  }
  return progress.complete ? "COMPLETE" : "INCOMPLETE";
}

export function defaultObjectiveAccessibility(label: string, current: number, target: number, status: ObjectiveStatus): ObjectiveAccessibility {
  const remaining = Math.max(0, target - current);
  const statusText =
    status === "COMPLETE"
      ? "Objective complete."
      : status === "FAILED"
        ? "Objective failed."
        : remaining > 0
          ? `Objective incomplete. ${remaining} remain.`
          : "Objective incomplete.";
  return {
    label,
    progressText: `${label} Progress: ${current} / ${target}. ${statusText}`,
    statusText,
    nonColorIndicator: `OBJ:${status}:${current}/${target}`,
    highContrast: status,
    reducedMotion: "Progress snaps; animation is presentation only.",
    audioCue: `objective.${status.toLowerCase()}`,
    hapticCue: `objective.${status.toLowerCase()}`,
  };
}

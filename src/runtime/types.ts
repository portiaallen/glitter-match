import type { Board } from "../board/index.js";
import type { CascadeReport } from "../cascade/index.js";
import type { MatchGroup } from "../matching/index.js";
import type { GameStats, ObjectiveState, WinStateResult } from "../objectives/index.js";
import type { ProgressionEvent } from "../progression/index.js";
import type { RandomSnapshot } from "../random/index.js";
import type { ReplayTape } from "../replay/index.js";
import type { AuthoritativeGameState, PresentationState, SessionStatus } from "../state/types.js";
import type { SpecialMatchRuntime } from "../special-matches/index.js";
import type { AccessibilitySettings } from "../ui/accessibility.js";
import type { ObjectiveRuntime } from "../objectives/index.js";
import type { PlayerProgression } from "../progression/index.js";
import type { SpecialIconInventory } from "../special-icons/index.js";
import type { EarnedReward } from "../economy/index.js";
import type { MechanicState } from "../mechanics/index.js";

/** Explicit Level Runtime lifecycle. Terminal states accept no further moves. */
export const RUNTIME_LIFECYCLE_STATES = [
  "UNINITIALIZED",
  "LOADING",
  "READY",
  "AWAITING_MOVE",
  "RESOLVING_MOVE",
  "RESOLVING_MATCHES",
  "RESOLVING_SPECIALS",
  "RESOLVING_CASCADE",
  "EVALUATING_OBJECTIVES",
  "EVALUATING_OUTCOME",
  "COMPLETE",
  "FAILED",
  "DEAD_UNRECOVERED",
  "ERROR",
] as const;

export type RuntimeLifecycleState = (typeof RUNTIME_LIFECYCLE_STATES)[number];

export const TERMINAL_RUNTIME_STATES = ["COMPLETE", "FAILED", "DEAD_UNRECOVERED", "ERROR"] as const;
export type TerminalRuntimeState = (typeof TERMINAL_RUNTIME_STATES)[number];

export const ILLEGAL_MOVE_CODES = [
  "ILLEGAL_MOVE",
  "INVALID_CELL",
  "NOT_CONNECTED",
  "SWAP_NOT_ALLOWED",
  "NO_MATCH",
  "SESSION_NOT_READY",
  "SESSION_ALREADY_COMPLETE",
  "SESSION_ALREADY_FAILED",
  "SESSION_RESOLVING",
] as const;
export type IllegalMoveCode = (typeof ILLEGAL_MOVE_CODES)[number];

export const RUNTIME_ERROR_CODES = [
  "INVALID_LEVEL",
  "INVALID_INITIAL_STATE",
  "INVALID_MOVE",
  "RUNTIME_STATE_ERROR",
  "ENGINE_RESOLUTION_ERROR",
  "CASCADE_SAFETY_LIMIT",
  "REPLAY_ERROR",
  "RESTORE_ERROR",
  "PROGRESSION_ERROR",
] as const;
export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export const RUNTIME_EVENT_KINDS = [
  "LOAD_STARTED",
  "LOAD_VALIDATED",
  "LEVEL_INITIALIZED",
  "ATTEMPT_STARTED",
  "MOVE_REJECTED",
  "MOVE_ACCEPTED",
  "MATCH_RESOLUTION_STARTED",
  "SPECIAL_RESOLUTION_STARTED",
  "CASCADE_CONTINUED",
  "OBJECTIVE_EVALUATED",
  "OUTCOME_EVALUATED",
  "TURN_COMMITTED",
  "LEVEL_COMPLETED",
  "LEVEL_FAILED",
  "RUNTIME_ERROR",
] as const;
export type RuntimeEventKind = (typeof RUNTIME_EVENT_KINDS)[number];

/**
 * Existing session policy for legal swaps that create no match.
 * Not a new game-design rule — this is the already-shipped `swap.requireMatch` contract.
 *
 * - `reject-revert`: requireMatch true (default). Reject, restore snapshot, do not consume a move.
 * - `commit`: requireMatch false. Keep the swapped board and continue the turn pipeline.
 */
export type NoMatchPolicy = "reject-revert" | "commit";

export interface PlayerMoveRequest {
  sourceCellId: string;
  targetCellId: string;
  metadata?: Record<string, unknown>;
}

export interface RuntimeEvent {
  sequence: number;
  kind: RuntimeEventKind;
  phase: RuntimeLifecycleState;
  message: string;
  data?: Record<string, unknown>;
}

export interface RuntimeTraceStep {
  turnNumber: number;
  stage: string;
  detail?: string;
}

export interface ObjectiveChange {
  objectiveId: string;
  previous: number;
  current: number;
  previousStatus: string;
  status: string;
}

export interface TurnRejection {
  code: IllegalMoveCode;
  reason: string;
}

export interface TurnError {
  code: RuntimeErrorCode;
  message: string;
}

export interface TurnResult {
  accepted: boolean;
  turnNumber: number;
  move?: PlayerMoveRequest;
  matches: MatchGroup[];
  specialMatchesCreated: string[];
  specialMatchesActivated: string[];
  cascadeCount: number;
  cascade: CascadeReport | null;
  objectiveChanges: ObjectiveChange[];
  outcome: WinStateResult | null;
  progressionEvents: ProgressionEvent[];
  stateHash: string;
  replay: RuntimeReplay;
  rejection?: TurnRejection;
  error?: TurnError;
  events: RuntimeEvent[];
  trace: RuntimeTraceStep[];
  noMatchPolicy: NoMatchPolicy;
}

export interface RuntimeReplay {
  levelId: string;
  contentVersion: string;
  schemaVersion: string;
  seed: string;
  initialStateHash: string;
  tape: ReplayTape;
}

export interface RuntimeAttempt {
  attemptId: string;
  sequence: number;
  seed: string;
  outcome: "in-progress" | "completed" | "failed" | "abandoned";
}

export interface CommittedGameplaySnapshot {
  lifecycle: RuntimeLifecycleState;
  sessionStatus: SessionStatus;
  board: Board;
  specialMatches: SpecialMatchRuntime;
  objectiveRuntime: ObjectiveRuntime;
  stats: GameStats;
  movesRemaining: number | null;
  combo: number;
  lastCascade: CascadeReport | null;
  earnedRewards: EarnedReward[];
  mechanicStates: Record<string, MechanicState>;
  specialInventory: SpecialIconInventory;
  rng: RandomSnapshot;
  turnNumber: number;
  eventSequence: number;
  events: RuntimeEvent[];
  tape: ReplayTape;
  attempt: RuntimeAttempt | null;
  legacyProgression: PlayerProgression;
  presentation: PresentationState;
  stateHash: string;
}

export interface RuntimeSnapshot {
  version: 1;
  runtimeId: string;
  levelId: string;
  contentVersion: string;
  schemaVersion: string;
  seed: string;
  accessibility: AccessibilitySettings;
  gameplay: CommittedGameplaySnapshot;
  authoritative: AuthoritativeGameState;
}

export interface RuntimeInspection {
  runtimeId: string;
  levelId: string;
  contentVersion: string;
  schemaVersion: string;
  seed: string;
  lifecycle: RuntimeLifecycleState;
  turnNumber: number;
  attempt: RuntimeAttempt | null;
  stateHash: string;
  outcome: WinStateResult;
  noMatchPolicy: NoMatchPolicy;
  accessibility: AccessibilitySettings;
  explanations: string[];
  events: RuntimeEvent[];
  trace: RuntimeTraceStep[];
}

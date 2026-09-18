import { areAdjacent, createBoard, getCell, type Board } from "../board/index.js";
import { runCascade, type CascadeReport } from "../cascade/index.js";
import { CONTENT_VERSION, SCHEMA_VERSION, versionsCompatible } from "../content/versions.js";
import type { EarnedReward } from "../economy/index.js";
import { canAttemptSwap, isDeadBoard, recoverDeadBoard, swapOccupants } from "../fairness/index.js";
import { createLandRegistry } from "../lands/index.js";
import {
  loadAndValidateLevel,
  toBoardDefinition,
  type LevelDefinition,
  type LevelValidationContext,
} from "../levels/index.js";
import { detectMatches, type MatchGroup } from "../matching/index.js";
import {
  createEmptyStats,
  createObjective,
  createObjectiveRuntime,
  evaluateRuntime,
  ingestCascade,
  type Objective,
  type ObjectiveDefinition,
  type ObjectiveEvaluationContext,
  type ObjectiveProgress,
  type WinStateResult,
} from "../objectives/index.js";
import {
  completeAttempt,
  createNewProgression,
  failAttempt,
  recordLevelClear,
  startAttempt,
  type PlayerProgression,
  type ProgressionEvent,
  type ProgressionRuntime,
} from "../progression/index.js";
import { createRandomSource, restoreRandomSource, type RandomSource } from "../random/index.js";
import {
  appendReplayEvent,
  createEmptyTape,
  playerMovesFromTape,
  type ReplayTape,
} from "../replay/index.js";
import { createEmptySpecialInventory } from "../special-icons/index.js";
import { createSpecialMatchRuntime, type CascadeSafetyLimits } from "../special-matches/index.js";
import type { EngineRegistries } from "../state/session.js";
import type { AuthoritativeGameState, PresentationState, SessionStatus } from "../state/types.js";
import { DEFAULT_ACCESSIBILITY } from "../ui/accessibility.js";
import { issue, throwIfErrors, ValidationError } from "../validation.js";
import { createRuntimeEvent } from "./events.js";
import { RuntimeError } from "./errors.js";
import { gameplayStateHash } from "./hash.js";
import { canTransition, isResolvingState, isTerminalRuntimeState } from "./lifecycle.js";
import { cloneGameplaySnapshot, cloneRuntimeSnapshot } from "./snapshot.js";
import type {
  CommittedGameplaySnapshot,
  IllegalMoveCode,
  NoMatchPolicy,
  PlayerMoveRequest,
  RuntimeAttempt,
  RuntimeErrorCode,
  RuntimeEvent,
  RuntimeEventKind,
  RuntimeLifecycleState,
  RuntimeReplay,
  RuntimeSnapshot,
  RuntimeTraceStep,
  TurnResult,
} from "./types.js";

let runtimeSeq = 0;

export interface RuntimeHooks {
  /** Test-only hook. Throws here must roll back the in-flight turn. */
  beforeCascade?: () => void;
}

export interface LoadLevelOptions {
  level: LevelDefinition;
  registries: EngineRegistries;
  seed: string;
  validation?: LevelValidationContext;
  specialInventory?: SpecialIconInventoryLike;
  progression?: PlayerProgression;
  progressionRuntime?: ProgressionRuntime;
  progressionNodeId?: string;
  accessibility?: typeof DEFAULT_ACCESSIBILITY;
  trace?: boolean;
  requiredSchemaVersion?: string;
  requiredContentVersion?: string;
  cascadeLimits?: Partial<CascadeSafetyLimits>;
  hooks?: RuntimeHooks;
}

type SpecialIconInventoryLike = AuthoritativeGameState["specialInventory"];

function allocateRuntimeId(levelId: string, seed: string): string {
  runtimeSeq += 1;
  return `runtime:${levelId}:${seed}:${runtimeSeq}`;
}

function sessionStatusFromLifecycle(lifecycle: RuntimeLifecycleState, previous: SessionStatus): SessionStatus {
  if (lifecycle === "COMPLETE") {
    return "won";
  }
  if (lifecycle === "FAILED") {
    return "lost";
  }
  if (lifecycle === "DEAD_UNRECOVERED") {
    return "dead-unrecovered";
  }
  if (lifecycle === "ERROR") {
    return previous;
  }
  return "playing";
}

/**
 * Canonical Level Runtime — one active level session.
 * Coordinates existing engines. Does not reimplement match, special, cascade,
 * objective, win-state, or unlock logic.
 */
export class LevelRuntime {
  readonly runtimeId: string;
  lifecycle: RuntimeLifecycleState = "UNINITIALIZED";
  level!: LevelDefinition;
  registries!: EngineRegistries;
  seed!: string;
  contentVersion!: string;
  schemaVersion!: string;
  turnNumber = 0;
  attempt: RuntimeAttempt | null = null;
  presentation!: PresentationState;
  legacyObjective!: Objective;
  legacyProgression!: PlayerProgression;
  authoritativeState!: AuthoritativeGameState;
  events: RuntimeEvent[] = [];
  trace: RuntimeTraceStep[] = [];
  lastTurn: TurnResult | null = null;
  noMatchPolicy: NoMatchPolicy = "reject-revert";
  replay!: RuntimeReplay;

  private random!: RandomSource;
  private eventSequence = 0;
  private initialStateHash = "";
  private tape!: ReplayTape;
  private localAttemptSequence = 0;
  private progressionRuntime: ProgressionRuntime | undefined;
  private progressionNodeId: string | undefined;
  private traceEnabled = false;
  private cascadeLimits: Partial<CascadeSafetyLimits> | undefined;
  private hooks: RuntimeHooks | undefined;
  private resolving = false;

  constructor() {
    this.runtimeId = allocateRuntimeId("uninitialized", "none");
  }

  get levelId(): string {
    return this.level?.id ?? "";
  }

  load(options: LoadLevelOptions): this {
    if (this.lifecycle !== "UNINITIALIZED" && this.lifecycle !== "ERROR") {
      throw new RuntimeError("RUNTIME_STATE_ERROR", `Cannot load while ${this.lifecycle}.`);
    }
    this.transition("LOADING");
    this.traceEnabled = Boolean(options.trace);
    this.hooks = options.hooks;
    this.cascadeLimits = options.cascadeLimits;
    this.registries = options.registries;
    this.seed = options.seed;
    this.progressionRuntime = options.progressionRuntime;
    this.progressionNodeId = options.progressionNodeId;
    this.presentation = {
      selectedCellId: null,
      highlightedCellIds: [],
      pendingCascade: null,
      accessibility: { ...DEFAULT_ACCESSIBILITY, ...options.accessibility },
    };
    this.events = [];
    this.trace = [];
    this.eventSequence = 0;
    this.turnNumber = 0;
    this.emit("LOAD_STARTED", "Loading level session.");

    try {
      const requiredSchema = options.requiredSchemaVersion ?? SCHEMA_VERSION;
      const requiredContent = options.requiredContentVersion ?? CONTENT_VERSION;
      const validation = options.validation ?? this.defaultValidationContext(options.level);
      const level = loadAndValidateLevel(options.level, validation);
      this.assertCompatible(level, requiredSchema, requiredContent);
      this.level = level;
      this.schemaVersion = level.schemaVersion ?? requiredSchema;
      this.contentVersion = level.contentVersion ?? requiredContent;
      this.noMatchPolicy = level.swap?.requireMatch === false ? "commit" : "reject-revert";
      this.legacyObjective = createObjective(level.objective);
      this.legacyProgression = options.progression ?? createNewProgression();
      this.random = createRandomSource(options.seed);
      this.emit("LOAD_VALIDATED", `Validated ${level.id}.`);

      const board = this.placeBoard();
      this.assertInitialBoard(board);
      this.authoritativeState = {
        levelId: level.id,
        land: level.land,
        board,
        stats: createEmptyStats(),
        movesRemaining: level.moveLimit,
        timeRemainingMs: level.timerMs ?? null,
        combo: 0,
        lastCascade: null,
        specialInventory: options.specialInventory ?? createEmptySpecialInventory(),
        specialMatches: createSpecialMatchRuntime(),
        objectiveRuntime: createObjectiveRuntime(this.levelObjectives(), level.winState, level.moveLimit !== null),
        earnedRewards: [],
        status: "playing",
        rng: this.random.snapshot(),
        seed: options.seed,
        mechanicStates: {},
      };
      this.tape = createEmptyTape(options.seed, toBoardDefinition(level), board);

      const initial = this.resolveBoard();
      this.authoritativeState.lastCascade = initial;
      this.presentation.pendingCascade = initial;
      ingestCascade(this.authoritativeState.objectiveRuntime, initial, this.objectiveContext("after-cascade"));
      this.ensureFairBoard();
      this.authoritativeState.rng = this.random.snapshot();
      this.initialStateHash = this.stateHash();
      this.replay = this.currentReplay();
      this.emit("LEVEL_INITIALIZED", `Initialized ${level.id} with seed ${options.seed}.`);
      this.beginAttempt();
      this.transition("READY");
      this.adoptFairnessLifecycle();
      const win = evaluateRuntime(this.authoritativeState.objectiveRuntime, this.objectiveContext("level-evaluation"));
      this.applyOutcome(win, { grantRewards: true, recordProgression: true });
      if (!isTerminalRuntimeState(this.lifecycle)) {
        this.lifecycle = "AWAITING_MOVE";
      }
      return this;
    } catch (error) {
      this.lifecycle = "ERROR";
      if (error instanceof RuntimeError || error instanceof ValidationError) {
        throw error;
      }
      throw new RuntimeError("INVALID_LEVEL", error instanceof Error ? error.message : String(error));
    }
  }

  submitMove(request: PlayerMoveRequest): TurnResult {
    const rejection = this.rejectIfNotAccepting(request);
    if (rejection) {
      return rejection;
    }
    const illegal = this.classifyIllegalMove(request.sourceCellId, request.targetCellId);
    if (illegal) {
      this.emit("MOVE_REJECTED", illegal.reason, { code: illegal.code, move: request });
      return this.rejectedResult(request, illegal.code, illegal.reason);
    }

    const snapshot = this.captureGameplay();
    const turnEventsStart = this.eventSequence;
    const progressionStart = this.progressionRuntime?.player.events.length ?? 0;
    const previousObjectives = structuredClone(this.authoritativeState.objectiveRuntime.states);
    this.resolving = true;
    this.trace = this.traceEnabled ? [] : this.trace;
    try {
      this.transition("RESOLVING_MOVE");
      this.note("MOVE", `${request.sourceCellId} → ${request.targetCellId}`);
      evaluateRuntime(this.authoritativeState.objectiveRuntime, this.objectiveContext("before-move"));
      swapOccupants(this.authoritativeState.board, request.sourceCellId, request.targetCellId);
      const immediate = detectMatches(this.authoritativeState.board, this.level.matchRules, this.registries.icons);
      if (immediate.length === 0 && this.noMatchPolicy === "reject-revert") {
        this.restoreGameplay(snapshot);
        this.lifecycle = "AWAITING_MOVE";
        this.resolving = false;
        this.emit("MOVE_REJECTED", "That swap does not create a match.", { code: "NO_MATCH", move: request });
        return this.rejectedResult(request, "NO_MATCH", "That swap does not create a match.");
      }

      this.emit("MOVE_ACCEPTED", `Accepted ${request.sourceCellId} ↔ ${request.targetCellId}.`, { move: request });
      evaluateRuntime(this.authoritativeState.objectiveRuntime, this.objectiveContext("after-move"));
      this.authoritativeState.specialMatches.moveIndex += 1;
      this.transition("RESOLVING_MATCHES");
      this.note("MATCH DETECTION", `${immediate.length} group(s)`);
      this.emit("MATCH_RESOLUTION_STARTED", "Match Engine resolution started.");
      this.hooks?.beforeCascade?.();
      this.transition("RESOLVING_SPECIALS");
      this.note("SPECIAL CANDIDATES");
      this.emit("SPECIAL_RESOLUTION_STARTED", "Special Match Engine resolution started.");
      this.transition("RESOLVING_CASCADE");
      this.note("CASCADE");
      const cascade = this.resolveBoard();
      if (cascade.combo > 1) {
        this.emit("CASCADE_CONTINUED", `Cascade combo ${cascade.combo}.`, { combo: cascade.combo });
      }
      this.note("SETTLE / REFILL", cascade.termination);
      if (cascade.termination === "CASCADE_INVALID") {
        throw new RuntimeError("ENGINE_RESOLUTION_ERROR", "Cascade terminated as CASCADE_INVALID.", {
          termination: cascade.termination,
        });
      }
      if (cascade.termination === "CASCADE_LIMIT_REACHED" || cascade.termination === "CASCADE_STATE_REPEAT") {
        this.emit("RUNTIME_ERROR", `Cascade safety termination ${cascade.termination}.`, {
          code: "CASCADE_SAFETY_LIMIT",
          termination: cascade.termination,
        });
      }

      this.transition("EVALUATING_OBJECTIVES");
      this.note("OBJECTIVE EVALUATION");
      ingestCascade(this.authoritativeState.objectiveRuntime, cascade, this.objectiveContext("after-cascade"));
      evaluateRuntime(this.authoritativeState.objectiveRuntime, this.objectiveContext("after-board-settlement"));
      const end = evaluateRuntime(this.authoritativeState.objectiveRuntime, this.objectiveContext("end-of-turn"));
      this.emit("OBJECTIVE_EVALUATED", end.whyComplete ?? end.whyIncomplete ?? end.whyFailed ?? "Objectives evaluated.");

      if (this.authoritativeState.movesRemaining !== null) {
        this.authoritativeState.movesRemaining -= 1;
      }
      this.authoritativeState.stats.movesUsed += 1;
      this.authoritativeState.combo = cascade.combo;
      this.authoritativeState.lastCascade = cascade;
      this.presentation.pendingCascade = cascade;
      this.turnNumber += 1;
      this.ensureFairBoard();

      this.transition("EVALUATING_OUTCOME");
      this.note("OUTCOME EVALUATION");
      const outcome = evaluateRuntime(this.authoritativeState.objectiveRuntime, this.objectiveContext("level-evaluation"));
      this.applyOutcome(outcome, { grantRewards: true, recordProgression: true });
      this.adoptFairnessLifecycle();
      this.emit("OUTCOME_EVALUATED", `Outcome ${outcome.state}.`);

      this.tape = appendReplayEvent(this.tape, {
        kind: "player-move",
        a: request.sourceCellId,
        b: request.targetCellId,
      });
      this.appendCascadeTape(cascade, outcome);
      this.authoritativeState.rng = this.random.snapshot();
      this.authoritativeState.status = sessionStatusFromLifecycle(this.lifecycle, this.authoritativeState.status);
      if (this.lifecycle === "EVALUATING_OUTCOME" || this.lifecycle === "RESOLVING_CASCADE") {
        this.transition("AWAITING_MOVE");
      }
      if (!isTerminalRuntimeState(this.lifecycle) && this.lifecycle !== "AWAITING_MOVE") {
        this.lifecycle = "AWAITING_MOVE";
      }
      this.note("COMMIT");
      this.emit("TURN_COMMITTED", `Committed turn ${this.turnNumber}.`);
      this.replay = this.currentReplay();
      this.resolving = false;
      const result = this.acceptedResult(request, cascade, previousObjectives, outcome, turnEventsStart, progressionStart);
      this.lastTurn = result;
      return result;
    } catch (error) {
      this.restoreGameplay(snapshot);
      this.lifecycle = "AWAITING_MOVE";
      this.resolving = false;
      const code: RuntimeErrorCode =
        error instanceof RuntimeError ? error.code : "ENGINE_RESOLUTION_ERROR";
      const message = error instanceof Error ? error.message : String(error);
      this.emit("RUNTIME_ERROR", message, { code });
      const result: TurnResult = {
        ...this.rejectedResult(request, "ILLEGAL_MOVE", message),
        accepted: false,
        error: { code, message },
        rejection: undefined,
      };
      this.lastTurn = result;
      return result;
    }
  }

  snapshot(): RuntimeSnapshot {
    this.assertLoaded();
    return {
      version: 1,
      runtimeId: this.runtimeId,
      levelId: this.level.id,
      contentVersion: this.contentVersion,
      schemaVersion: this.schemaVersion,
      seed: this.seed,
      accessibility: { ...this.presentation.accessibility },
      gameplay: this.captureGameplay(),
      authoritative: structuredClone(this.authoritativeState),
    };
  }

  restore(snapshot: RuntimeSnapshot): void {
    try {
      if (snapshot.levelId !== this.level?.id) {
        throw new RuntimeError("RESTORE_ERROR", `Snapshot level "${snapshot.levelId}" does not match "${this.level?.id}".`);
      }
      if (snapshot.contentVersion !== this.contentVersion) {
        throw new RuntimeError("RESTORE_ERROR", `Snapshot content version "${snapshot.contentVersion}" does not match "${this.contentVersion}".`);
      }
      const cloned = cloneRuntimeSnapshot(snapshot);
      this.restoreGameplay(cloned.gameplay);
      this.presentation.accessibility = { ...cloned.accessibility };
      this.replay = this.currentReplay();
    } catch (error) {
      if (error instanceof RuntimeError) {
        throw error;
      }
      throw new RuntimeError("RESTORE_ERROR", error instanceof Error ? error.message : String(error));
    }
  }

  replayMoves(replay: RuntimeReplay): { runtime: LevelRuntime; result: TurnResult | null } {
    if (replay.levelId !== this.level.id) {
      throw new RuntimeError("REPLAY_ERROR", `Replay level "${replay.levelId}" does not match "${this.level.id}".`);
    }
    if (replay.contentVersion !== this.contentVersion && !versionsCompatible(replay.contentVersion, this.contentVersion)) {
      throw new RuntimeError("REPLAY_ERROR", `Replay content version "${replay.contentVersion}" is incompatible with "${this.contentVersion}".`);
    }
    if (replay.schemaVersion !== this.schemaVersion && !versionsCompatible(replay.schemaVersion, this.schemaVersion)) {
      throw new RuntimeError("REPLAY_ERROR", `Replay schema version "${replay.schemaVersion}" is incompatible with "${this.schemaVersion}".`);
    }
    let last: TurnResult | null = null;
    for (const move of playerMovesFromTape(replay.tape)) {
      last = this.submitMove({ sourceCellId: move.a, targetCellId: move.b });
      if (!last.accepted) {
        throw new RuntimeError("REPLAY_ERROR", last.rejection?.reason ?? last.error?.message ?? "Replay move was rejected.");
      }
    }
    return { runtime: this, result: last };
  }

  stateHash(): string {
    this.assertLoaded();
    return gameplayStateHash({
      board: this.authoritativeState.board,
      specialMatches: this.authoritativeState.specialMatches,
      objectiveRuntime: this.authoritativeState.objectiveRuntime,
      stats: this.authoritativeState.stats,
      movesRemaining: this.authoritativeState.movesRemaining,
      turnNumber: this.turnNumber,
      combo: this.authoritativeState.combo,
      rngState: this.random.snapshot().state,
      lifecycle: this.lifecycle === "RESOLVING_MOVE" ? "AWAITING_MOVE" : this.lifecycle,
    });
  }

  inspectWinState(): WinStateResult {
    this.assertLoaded();
    return evaluateRuntime(this.authoritativeState.objectiveRuntime, this.objectiveContext("level-evaluation"));
  }

  inspectObjective(): ObjectiveProgress {
    this.assertLoaded();
    return this.legacyObjective.evaluate(this.objectiveContext());
  }

  debugForceOccupants(occupants: Record<string, string | null>): void {
    this.assertLoaded();
    for (const [cellId, iconId] of Object.entries(occupants)) {
      getCell(this.authoritativeState.board, cellId).occupant = iconId ? { type: "icon", iconId } : { type: "empty" };
    }
    this.ensureFairBoard();
    const win = evaluateRuntime(this.authoritativeState.objectiveRuntime, this.objectiveContext("level-evaluation"));
    this.applyOutcome(win, { grantRewards: false, recordProgression: false });
    this.authoritativeState.rng = this.random.snapshot();
  }

  objectiveContext(phase?: ObjectiveEvaluationContext["phase"]): ObjectiveEvaluationContext {
    const occupiedIcons: Record<string, string | null> = {};
    const hiddenCellIds: string[] = [];
    for (const id of this.authoritativeState.board.topology.cellIds) {
      const cell = getCell(this.authoritativeState.board, id);
      occupiedIcons[id] = cell.occupant.type === "icon" ? cell.occupant.iconId : null;
      if (cell.flags.hidden) {
        hiddenCellIds.push(id);
      }
    }
    return {
      stats: this.authoritativeState.stats,
      movesRemaining: this.authoritativeState.movesRemaining,
      moveLimit: this.level.moveLimit,
      occupiedIcons,
      hiddenCellIds,
      board: this.authoritativeState.board,
      phase,
      events: this.authoritativeState.objectiveRuntime.events,
    };
  }

  private defaultValidationContext(level: LevelDefinition): LevelValidationContext {
    const lands = "lands" in this.registries && this.registries.lands
      ? (this.registries as EngineRegistries & { lands: LevelValidationContext["lands"] }).lands
      : createLandRegistry();
    return {
      icons: this.registries.icons,
      obstacles: this.registries.obstacles,
      mechanics: this.registries.mechanics,
      lands,
      profile: level.status === "production" ? "production" : "development",
    };
  }

  private assertCompatible(level: LevelDefinition, requiredSchema: string, requiredContent: string): void {
    if (level.schemaVersion && !versionsCompatible(level.schemaVersion, requiredSchema)) {
      throw new RuntimeError(
        "INVALID_LEVEL",
        `Schema version "${level.schemaVersion}" is not compatible with "${requiredSchema}".`,
        { schemaVersion: level.schemaVersion, requiredSchema },
      );
    }
    if (level.contentVersion && !versionsCompatible(level.contentVersion, requiredContent)) {
      throw new RuntimeError(
        "INVALID_LEVEL",
        `Content version "${level.contentVersion}" is not compatible with "${requiredContent}".`,
        { contentVersion: level.contentVersion, requiredContent },
      );
    }
  }

  private assertInitialBoard(board: Board): void {
    for (const id of board.topology.cellIds) {
      const cell = board.cells[id];
      if (!cell) {
        throw new RuntimeError("INVALID_INITIAL_STATE", `Initial board is missing cell "${id}".`);
      }
      if (cell.occupant.type === "icon" && !this.registries.icons.has(cell.occupant.iconId)) {
        throw new RuntimeError("INVALID_INITIAL_STATE", `Initial occupant "${cell.occupant.iconId}" is not registered.`);
      }
    }
    if (this.level.placement.avoidInitialMatches) {
      const matches = detectMatches(board, this.level.matchRules, this.registries.icons);
      if (matches.length > 0) {
        throw new RuntimeError("INVALID_INITIAL_STATE", "Initial board contains matches but avoidInitialMatches is set.");
      }
    }
  }

  private placeBoard(): Board {
    const definition = toBoardDefinition(this.level);
    const board = createBoard(definition);
    if (this.level.placement.mode === "authored") {
      return board;
    }
    const rng = this.random.fork(`placement:${this.level.placement.seedSalt ?? this.seed}`);
    for (const cellId of board.topology.cellIds) {
      const cell = getCell(board, cellId);
      if (!cell.flags.active || cell.occupant.type === "icon") {
        continue;
      }
      cell.occupant = { type: "icon", iconId: rng.pick(this.level.iconPool) };
    }
    return board;
  }

  private resolveBoard(): CascadeReport {
    return runCascade({
      board: this.authoritativeState.board,
      matchRules: this.level.matchRules,
      iconRegistry: this.registries.icons,
      obstacleRegistry: this.registries.obstacles,
      iconPool: this.level.iconPool,
      random: this.random,
      stats: this.authoritativeState.stats,
      scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
      specialRuntime: this.authoritativeState.specialMatches,
      cascadeLimits: this.cascadeLimits,
    });
  }

  private ensureFairBoard(): void {
    if (this.authoritativeState.status !== "playing" && this.lifecycle !== "READY" && this.lifecycle !== "EVALUATING_OUTCOME" && this.lifecycle !== "RESOLVING_CASCADE") {
      if (isTerminalRuntimeState(this.lifecycle)) {
        return;
      }
    }
    if (this.inspectObjective().complete) {
      return;
    }
    const fairness = this.level.fairness ?? { onDeadBoard: "shuffle", maxShuffleAttempts: 32 };
    if (isDeadBoard(this.authoritativeState.board, this.level.matchRules, this.registries.icons, this.registries.obstacles)) {
      const result = recoverDeadBoard(
        this.authoritativeState.board,
        this.level.matchRules,
        this.registries.icons,
        this.registries.obstacles,
        this.random.fork("dead-board"),
        fairness.onDeadBoard,
        fairness.maxShuffleAttempts ?? 32,
      );
      if (!result.recovered) {
        this.authoritativeState.status = "dead-unrecovered";
      }
    }
  }

  private adoptFairnessLifecycle(): void {
    if (this.authoritativeState.status === "dead-unrecovered" && this.lifecycle !== "DEAD_UNRECOVERED") {
      if (this.lifecycle === "READY") {
        this.transition("DEAD_UNRECOVERED");
        return;
      }
      if (this.lifecycle === "EVALUATING_OUTCOME") {
        this.transition("DEAD_UNRECOVERED");
        return;
      }
      this.lifecycle = "DEAD_UNRECOVERED";
    }
  }

  private applyOutcome(win: WinStateResult, options: { grantRewards: boolean; recordProgression: boolean }): void {
    if (this.lifecycle === "DEAD_UNRECOVERED") {
      return;
    }
    if (win.state === "COMPLETED") {
      this.lifecycle = "COMPLETE";
      this.authoritativeState.status = "won";
      if (options.grantRewards) {
        this.grantRewards();
      }
      if (options.recordProgression) {
        this.recordCompletion(win);
      }
      this.emit("LEVEL_COMPLETED", win.whyComplete ?? "Level completed.", { mastery: false });
      return;
    }
    if (win.state === "FAILED") {
      this.lifecycle = "FAILED";
      this.authoritativeState.status = "lost";
      if (options.recordProgression) {
        this.recordFailure(win);
      }
      this.emit("LEVEL_FAILED", win.whyFailed ?? "Level failed.");
    }
  }

  private beginAttempt(): void {
    this.localAttemptSequence += 1;
    const nodeId = this.progressionNodeId ?? this.level.id;
    if (this.progressionRuntime && this.progressionRuntime.catalog.some((node) => node.id === nodeId)) {
      try {
        const record = startAttempt(this.progressionRuntime, nodeId, this.seed);
        this.attempt = {
          attemptId: record.attemptId,
          sequence: this.localAttemptSequence,
          seed: this.seed,
          outcome: "in-progress",
        };
        this.emit("ATTEMPT_STARTED", `Attempt ${record.attemptId} started.`);
        return;
      } catch (error) {
        throw new RuntimeError("PROGRESSION_ERROR", error instanceof Error ? error.message : String(error));
      }
    }
    this.attempt = {
      attemptId: `${this.level.id}:attempt-${this.localAttemptSequence}`,
      sequence: this.localAttemptSequence,
      seed: this.seed,
      outcome: "in-progress",
    };
    this.emit("ATTEMPT_STARTED", `Attempt ${this.attempt.attemptId} started.`);
  }

  private recordCompletion(_win: WinStateResult): void {
    this.legacyProgression = recordLevelClear(this.legacyProgression, this.level.id, this.level.land, 0);
    if (this.attempt) {
      this.attempt = { ...this.attempt, outcome: "completed" };
    }
    if (!this.progressionRuntime || !this.attempt) {
      return;
    }
    const nodeId = this.progressionNodeId ?? this.level.id;
    if (!this.progressionRuntime.catalog.some((node) => node.id === nodeId)) {
      return;
    }
    try {
      completeAttempt(this.progressionRuntime, this.attempt.attemptId, {
        score: this.authoritativeState.stats.score,
        moveCount: this.authoritativeState.stats.movesUsed,
        mastered: false,
      });
    } catch (error) {
      this.emit("RUNTIME_ERROR", error instanceof Error ? error.message : String(error), { code: "PROGRESSION_ERROR" });
    }
  }

  private recordFailure(_win: WinStateResult): void {
    if (this.attempt) {
      this.attempt = { ...this.attempt, outcome: "failed" };
    }
    if (!this.progressionRuntime || !this.attempt) {
      return;
    }
    const nodeId = this.progressionNodeId ?? this.level.id;
    if (!this.progressionRuntime.catalog.some((node) => node.id === nodeId)) {
      return;
    }
    try {
      failAttempt(this.progressionRuntime, this.attempt.attemptId, {
        score: this.authoritativeState.stats.score,
        moveCount: this.authoritativeState.stats.movesUsed,
      });
    } catch (error) {
      this.emit("RUNTIME_ERROR", error instanceof Error ? error.message : String(error), { code: "PROGRESSION_ERROR" });
    }
  }

  private grantRewards(): void {
    if (this.authoritativeState.earnedRewards.length > 0) {
      return;
    }
    this.authoritativeState.earnedRewards = (this.level.rewards ?? []).map((reward) => ({
      ...reward,
      source: "level-clear",
    })) as EarnedReward[];
  }

  private levelObjectives(): ObjectiveDefinition[] {
    const extras = (this.level.objectives ?? []).map((item) => item as ObjectiveDefinition);
    const optional = (this.level.mastery?.optionalObjectives ?? []).map((item) => ({
      ...(item as ObjectiveDefinition),
      role: (item as ObjectiveDefinition).role ?? ("optional" as const),
    }));
    return [this.level.objective as ObjectiveDefinition, ...extras, ...optional];
  }

  private classifyIllegalMove(source: string, target: string): { code: IllegalMoveCode; reason: string } | null {
    if (!this.authoritativeState.board.cells[source] || !this.authoritativeState.board.cells[target]) {
      return { code: "INVALID_CELL", reason: `Unknown cell "${this.authoritativeState.board.cells[source] ? target : source}".` };
    }
    if (source === target) {
      return { code: "ILLEGAL_MOVE", reason: "A cell cannot be swapped with itself." };
    }
    if (!areAdjacent(this.authoritativeState.board, source, target, { forSwap: true })) {
      return {
        code: "NOT_CONNECTED",
        reason: `Cells "${source}" and "${target}" are not connected by a swap-legal graph edge.`,
      };
    }
    if (!canAttemptSwap(this.authoritativeState.board, source, target, this.registries.obstacles)) {
      return {
        code: "SWAP_NOT_ALLOWED",
        reason: `Swap of "${source}" and "${target}" is not allowed by occupancy, activity, or obstacles.`,
      };
    }
    return null;
  }

  private rejectIfNotAccepting(request: PlayerMoveRequest): TurnResult | null {
    if (this.lifecycle === "UNINITIALIZED" || this.lifecycle === "LOADING" || this.lifecycle === "READY") {
      return this.rejectedResult(request, "SESSION_NOT_READY", `Session is ${this.lifecycle}.`);
    }
    if (this.lifecycle === "COMPLETE") {
      return this.rejectedResult(request, "SESSION_ALREADY_COMPLETE", "Session is already complete.");
    }
    if (this.lifecycle === "FAILED" || this.lifecycle === "DEAD_UNRECOVERED") {
      return this.rejectedResult(request, "SESSION_ALREADY_FAILED", `Session is ${this.lifecycle}.`);
    }
    if (this.lifecycle === "ERROR") {
      return this.rejectedResult(request, "SESSION_NOT_READY", "Session is in ERROR and cannot accept moves.");
    }
    if (this.resolving || isResolvingState(this.lifecycle)) {
      return this.rejectedResult(request, "SESSION_RESOLVING", "A move is already resolving.");
    }
    if (this.lifecycle !== "AWAITING_MOVE") {
      return this.rejectedResult(request, "SESSION_NOT_READY", `Session is ${this.lifecycle}.`);
    }
    return null;
  }

  private rejectedResult(request: PlayerMoveRequest, code: IllegalMoveCode, reason: string): TurnResult {
    return {
      accepted: false,
      turnNumber: this.turnNumber,
      move: request,
      matches: [],
      specialMatchesCreated: [],
      specialMatchesActivated: [],
      cascadeCount: 0,
      cascade: null,
      objectiveChanges: [],
      outcome: this.level ? this.inspectWinState() : null,
      progressionEvents: [],
      stateHash: this.level ? this.stateHash() : "",
      replay: this.level ? this.currentReplay() : this.emptyReplay(),
      rejection: { code, reason },
      events: this.events.slice(),
      trace: this.trace.slice(),
      noMatchPolicy: this.noMatchPolicy,
    };
  }

  private acceptedResult(
    request: PlayerMoveRequest,
    cascade: CascadeReport,
    previousObjectives: typeof this.authoritativeState.objectiveRuntime.states,
    outcome: WinStateResult,
    eventStart: number,
    progressionStart: number,
  ): TurnResult {
    const matches: MatchGroup[] = cascade.steps.flatMap((step) => (step.phase === "detect" || step.phase === "resolve" ? step.matches : []));
    const unique = new Map(matches.map((group) => [group.groupId ?? group.cellIds.join(","), group]));
    const activated = cascade.specialEvents
      .filter((event) => event.kind === "SPECIAL_MATCH_ACTIVATED")
      .map((event) => event.instanceId)
      .filter((id): id is string => Boolean(id));
    const objectiveChanges = Object.values(this.authoritativeState.objectiveRuntime.states)
      .map((state) => {
        const previous = previousObjectives[state.objectiveId];
        if (!previous || (previous.current === state.current && previous.status === state.status)) {
          return null;
        }
        return {
          objectiveId: state.objectiveId,
          previous: previous.current,
          current: state.current,
          previousStatus: previous.status,
          status: state.status,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const progressionEvents: ProgressionEvent[] = this.progressionRuntime
      ? this.progressionRuntime.player.events.slice(progressionStart)
      : [];
    return {
      accepted: true,
      turnNumber: this.turnNumber,
      move: request,
      matches: [...unique.values()],
      specialMatchesCreated: cascade.specialMatchesCreated,
      specialMatchesActivated: activated,
      cascadeCount: cascade.combo,
      cascade,
      objectiveChanges,
      outcome,
      progressionEvents,
      stateHash: this.stateHash(),
      replay: this.currentReplay(),
      events: this.events.filter((event) => event.sequence > eventStart),
      trace: this.trace.slice(),
      noMatchPolicy: this.noMatchPolicy,
    };
  }

  private appendCascadeTape(cascade: CascadeReport, outcome: WinStateResult): void {
    const cleared = cascade.steps.flatMap((step) => step.clearedCellIds);
    this.tape = appendReplayEvent(this.tape, {
      kind: "match-detection",
      combo: cascade.combo,
      groupCount: cascade.steps.filter((step) => step.phase === "detect").reduce((sum, step) => sum + step.matches.length, 0),
      cellIds: [...new Set(cleared)].sort(),
    });
    this.tape = appendReplayEvent(this.tape, { kind: "cascade", combo: cascade.combo, clearedCellIds: cleared });
    this.tape = appendReplayEvent(this.tape, {
      kind: "special-match",
      instanceIds: cascade.specialMatchesCreated,
      created: cascade.specialMatchesCreated,
      termination: cascade.termination,
    });
    const moved = cascade.steps.flatMap((step) => step.moved);
    if (moved.length > 0) {
      this.tape = appendReplayEvent(this.tape, { kind: "board-movement", moves: moved });
    }
    const root = this.authoritativeState.objectiveRuntime.states[this.level.objective.id];
    this.tape = appendReplayEvent(this.tape, {
      kind: "objective",
      complete: outcome.complete,
      status: root?.status,
      winState: outcome.state,
      current: root?.current,
      target: root?.target,
    });
  }

  private captureGameplay(): CommittedGameplaySnapshot {
    return cloneGameplaySnapshot({
      lifecycle: this.lifecycle,
      sessionStatus: this.authoritativeState.status,
      board: this.authoritativeState.board,
      specialMatches: this.authoritativeState.specialMatches,
      objectiveRuntime: this.authoritativeState.objectiveRuntime,
      stats: this.authoritativeState.stats,
      movesRemaining: this.authoritativeState.movesRemaining,
      combo: this.authoritativeState.combo,
      lastCascade: this.authoritativeState.lastCascade,
      earnedRewards: this.authoritativeState.earnedRewards,
      mechanicStates: this.authoritativeState.mechanicStates,
      specialInventory: this.authoritativeState.specialInventory,
      rng: this.random.snapshot(),
      turnNumber: this.turnNumber,
      eventSequence: this.eventSequence,
      events: this.events,
      tape: this.tape,
      attempt: this.attempt,
      legacyProgression: this.legacyProgression,
      presentation: this.presentation,
      stateHash: this.stateHash(),
    });
  }

  private restoreGameplay(snapshot: CommittedGameplaySnapshot): void {
    const cloned = cloneGameplaySnapshot(snapshot);
    this.lifecycle = cloned.lifecycle;
    this.authoritativeState.board = cloned.board;
    this.authoritativeState.specialMatches = cloned.specialMatches;
    this.authoritativeState.objectiveRuntime = cloned.objectiveRuntime;
    this.authoritativeState.stats = cloned.stats;
    this.authoritativeState.movesRemaining = cloned.movesRemaining;
    this.authoritativeState.combo = cloned.combo;
    this.authoritativeState.lastCascade = cloned.lastCascade;
    this.authoritativeState.earnedRewards = cloned.earnedRewards;
    this.authoritativeState.mechanicStates = cloned.mechanicStates;
    this.authoritativeState.specialInventory = cloned.specialInventory;
    this.authoritativeState.status = cloned.sessionStatus;
    this.authoritativeState.rng = cloned.rng;
    this.random = restoreRandomSource(cloned.rng);
    this.turnNumber = cloned.turnNumber;
    this.eventSequence = cloned.eventSequence;
    this.events = cloned.events;
    this.tape = cloned.tape;
    this.attempt = cloned.attempt;
    this.legacyProgression = cloned.legacyProgression;
    this.presentation = cloned.presentation;
    this.presentation.pendingCascade = cloned.lastCascade;
  }

  private currentReplay(): RuntimeReplay {
    return {
      levelId: this.level.id,
      contentVersion: this.contentVersion,
      schemaVersion: this.schemaVersion,
      seed: this.seed,
      initialStateHash: this.initialStateHash,
      tape: structuredClone(this.tape),
    };
  }

  private emptyReplay(): RuntimeReplay {
    return {
      levelId: "",
      contentVersion: "",
      schemaVersion: "",
      seed: "",
      initialStateHash: "",
      tape: { version: 1, seed: "", definition: { topology: { kind: "custom" }, cells: [], adjacency: [] }, initialOccupants: {}, events: [] },
    };
  }

  private emit(kind: RuntimeEventKind, message: string, data?: Record<string, unknown>): void {
    this.eventSequence += 1;
    this.events.push(createRuntimeEvent(this.eventSequence, kind, this.lifecycle, message, data));
  }

  private note(stage: string, detail?: string): void {
    if (!this.traceEnabled) {
      return;
    }
    this.trace.push({ turnNumber: this.turnNumber + 1, stage, detail });
  }

  private transition(next: RuntimeLifecycleState): void {
    if (!canTransition(this.lifecycle, next)) {
      throw new RuntimeError("RUNTIME_STATE_ERROR", `Invalid transition ${this.lifecycle} → ${next}.`);
    }
    this.lifecycle = next;
  }

  private assertLoaded(): void {
    if (!this.level || this.lifecycle === "UNINITIALIZED") {
      throw new RuntimeError("RUNTIME_STATE_ERROR", "Runtime is not loaded.");
    }
  }
}

export function createLevelRuntime(): LevelRuntime {
  return new LevelRuntime();
}

export function loadLevelRuntime(options: LoadLevelOptions): LevelRuntime {
  return createLevelRuntime().load(options);
}

export function replayLevelRuntime(options: LoadLevelOptions, replay: RuntimeReplay): LevelRuntime {
  if (options.level.id !== replay.levelId) {
    throw new RuntimeError("REPLAY_ERROR", `Replay level "${replay.levelId}" does not match "${options.level.id}".`);
  }
  const content = options.level.contentVersion ?? options.requiredContentVersion ?? CONTENT_VERSION;
  if (replay.contentVersion !== content && !versionsCompatible(replay.contentVersion, content)) {
    throw new RuntimeError("REPLAY_ERROR", `Replay content version "${replay.contentVersion}" is incompatible.`);
  }
  const runtime = loadLevelRuntime({ ...options, seed: replay.seed });
  runtime.replayMoves(replay);
  return runtime;
}

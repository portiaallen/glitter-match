import { createBoard, getCell, type Board } from "../board/index.js";
import { runCascade, type CascadeReport } from "../cascade/index.js";
import { detectMatches } from "../matching/index.js";
import type { EarnedReward } from "../economy/index.js";
import {
  canAttemptSwap,
  isDeadBoard,
  recoverDeadBoard,
  swapOccupants,
} from "../fairness/index.js";
import type { IconRegistry } from "../icons/index.js";
import { toBoardDefinition, type LevelDefinition } from "../levels/index.js";
import type { MechanicRegistry } from "../mechanics/index.js";
import {
  createObjective,
  createEmptyStats,
  createObjectiveRuntime,
  evaluateRuntime,
  ingestCascade,
  type Objective,
  type ObjectiveProgress,
  type ObjectiveDefinition,
  type WinStateResult,
} from "../objectives/index.js";
import type { ObstacleRegistry } from "../obstacles/index.js";
import { createNewProgression, type PlayerProgression } from "../progression/index.js";
import { createRandomSource, restoreRandomSource, type RandomSource } from "../random/index.js";
import { createEmptySpecialInventory, type SpecialIconInventory } from "../special-icons/index.js";
import { createSpecialMatchRuntime } from "../special-matches/index.js";
import { DEFAULT_ACCESSIBILITY } from "../ui/accessibility.js";
import { issue, throwIfErrors } from "../validation.js";
import type { AuthoritativeGameState, PresentationState } from "./types.js";

export interface EngineRegistries {
  icons: IconRegistry;
  obstacles: ObstacleRegistry;
  mechanics: MechanicRegistry;
}

export interface StartLevelOptions {
  level: LevelDefinition;
  registries: EngineRegistries;
  seed: string;
  specialInventory?: SpecialIconInventory;
  progression?: PlayerProgression;
}

export class GameSession {
  readonly level: LevelDefinition;
  readonly registries: EngineRegistries;
  readonly objective: Objective;
  progression: PlayerProgression;
  presentation: PresentationState;
  private random: RandomSource;
  state: AuthoritativeGameState;

  constructor(options: StartLevelOptions) {
    this.level = options.level;
    this.registries = options.registries;
    this.objective = createObjective(options.level.objective);
    this.progression = options.progression ?? createNewProgression();
    this.random = createRandomSource(options.seed);
    this.presentation = {
      selectedCellId: null,
      highlightedCellIds: [],
      pendingCascade: null,
      accessibility: { ...DEFAULT_ACCESSIBILITY },
    };

    const board = this.placeBoard(options.seed);
    this.state = {
      levelId: options.level.id,
      land: options.level.land,
      board,
      stats: createEmptyStats(),
      movesRemaining: options.level.moveLimit,
      timeRemainingMs: options.level.timerMs ?? null,
      combo: 0,
      lastCascade: null,
      specialInventory: options.specialInventory ?? createEmptySpecialInventory(),
      specialMatches: createSpecialMatchRuntime(),
      objectiveRuntime: createObjectiveRuntime(this.levelObjectives(), options.level.winState, options.level.moveLimit !== null),
      earnedRewards: [],
      status: "playing",
      rng: this.random.snapshot(),
      seed: options.seed,
      mechanicStates: {},
    };

    const initial = this.resolveBoard();
    this.state.lastCascade = initial;
    this.presentation.pendingCascade = initial;
    ingestCascade(this.state.objectiveRuntime, initial, this.objectiveContext());
    this.ensureFairBoard();
    this.refreshStatus();
  }

  inspectObjective(): ObjectiveProgress {
    return this.objective.evaluate(this.objectiveContext());
  }

  inspectWinState(): WinStateResult {
    return evaluateRuntime(this.state.objectiveRuntime, this.objectiveContext());
  }

  swap(a: string, b: string): CascadeReport {
    this.assertPlaying();
    if (!canAttemptSwap(this.state.board, a, b, this.registries.obstacles)) {
      throwIfErrors(
        [issue("swap.illegal", "swap", `Cannot swap "${a}" and "${b}".`)],
        "Illegal swap",
      );
    }

    swapOccupants(this.state.board, a, b);
    const requireMatch = this.level.swap?.requireMatch ?? true;
    if (requireMatch) {
      const matches = detectMatches(this.state.board, this.level.matchRules, this.registries.icons);
      if (matches.length === 0) {
        swapOccupants(this.state.board, a, b);
        throwIfErrors(
          [issue("swap.no_match", "swap", "That swap does not create a match.")],
          "Swap did not match",
        );
      }
    }
    this.state.specialMatches.moveIndex += 1;
    const cascade = this.resolveBoard();
    ingestCascade(this.state.objectiveRuntime, cascade, this.objectiveContext());

    if (this.state.movesRemaining !== null) {
      this.state.movesRemaining -= 1;
    }
    this.state.stats.movesUsed += 1;
    this.state.combo = cascade.combo;
    this.state.lastCascade = cascade;
    this.presentation.pendingCascade = cascade;
    this.ensureFairBoard();
    this.refreshStatus();
    this.state.rng = this.random.snapshot();
    return cascade;
  }

  forceOccupants(occupants: Record<string, string | null>): void {
    for (const [cellId, iconId] of Object.entries(occupants)) {
      const cell = getCell(this.state.board, cellId);
      cell.occupant = iconId ? { type: "icon", iconId } : { type: "empty" };
    }
    this.ensureFairBoard();
    this.refreshStatus();
  }

  private placeBoard(seed: string): Board {
    const definition = toBoardDefinition(this.level);
    const board = createBoard(definition);
    if (this.level.placement.mode === "authored") {
      return board;
    }
    const rng = this.random.fork(`placement:${this.level.placement.seedSalt ?? seed}`);
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
      board: this.state.board,
      matchRules: this.level.matchRules,
      iconRegistry: this.registries.icons,
      obstacleRegistry: this.registries.obstacles,
      iconPool: this.level.iconPool,
      random: this.random,
      stats: this.state.stats,
      scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
      specialRuntime: this.state.specialMatches,
    });
  }

  private ensureFairBoard(): void {
    if (this.state.status !== "playing") {
      return;
    }
    if (this.inspectObjective().complete) {
      return;
    }
    const fairness = this.level.fairness ?? { onDeadBoard: "shuffle", maxShuffleAttempts: 32 };
    if (
      isDeadBoard(
        this.state.board,
        this.level.matchRules,
        this.registries.icons,
        this.registries.obstacles,
      )
    ) {
      const result = recoverDeadBoard(
        this.state.board,
        this.level.matchRules,
        this.registries.icons,
        this.registries.obstacles,
        this.random.fork("dead-board"),
        fairness.onDeadBoard,
        fairness.maxShuffleAttempts ?? 32,
      );
      if (!result.recovered) {
        this.state.status = "dead-unrecovered";
      }
    }
  }

  private refreshStatus(): void {
    const win = evaluateRuntime(this.state.objectiveRuntime, this.objectiveContext());
    if (win.state === "COMPLETED") {
      this.state.status = "won";
      this.grantRewards();
      return;
    }
    if (this.state.status === "dead-unrecovered") {
      return;
    }
    if (win.state === "FAILED") {
      this.state.status = "lost";
    }
  }

  private levelObjectives(): ObjectiveDefinition[] {
    const extras = (this.level.objectives ?? []).map((item) => item as ObjectiveDefinition);
    const optional = (this.level.mastery?.optionalObjectives ?? []).map((item) => ({
      ...(item as ObjectiveDefinition),
      role: (item as ObjectiveDefinition).role ?? ("optional" as const),
    }));
    return [this.level.objective as ObjectiveDefinition, ...extras, ...optional];
  }

  private grantRewards(): void {
    if (this.state.earnedRewards.length > 0) {
      return;
    }
    this.state.earnedRewards = (this.level.rewards ?? []).map((reward) => ({
      ...reward,
      source: "level-clear",
    })) as EarnedReward[];
  }

  private assertPlaying(): void {
    if (this.state.status !== "playing") {
      throwIfErrors(
        [issue("session.not_playing", "status", `Session is ${this.state.status}.`)],
        "Session is not playable",
      );
    }
  }

  private objectiveContext() {
    const occupiedIcons: Record<string, string | null> = {};
    const hiddenCellIds: string[] = [];
    for (const id of this.state.board.topology.cellIds) {
      const cell = getCell(this.state.board, id);
      occupiedIcons[id] = cell.occupant.type === "icon" ? cell.occupant.iconId : null;
      if (cell.flags.hidden) {
        hiddenCellIds.push(id);
      }
    }
    return {
      stats: this.state.stats,
      movesRemaining: this.state.movesRemaining,
      moveLimit: this.level.moveLimit,
      occupiedIcons,
      hiddenCellIds,
      board: this.state.board,
      events: this.state.objectiveRuntime.events,
    };
  }
}

export function startLevel(options: StartLevelOptions): GameSession {
  return new GameSession(options);
}

import { createBoard, getCell } from "../board/graph.js";
import type { Board, BoardDefinition } from "../board/types.js";
import { compileBoardDocument, defaultLabMatchRules, type BoardDocument } from "../board/document.js";
import { runCascade, type CascadeReport } from "../cascade/index.js";
import {
  canAttemptSwap,
  isDeadBoard,
  listValidMoves,
  recoverDeadBoard,
  swapOccupants,
  type RecoveryResult,
  type SwapMove,
} from "../fairness/index.js";
import { detectMatches, type MatchGroup, type MatchRules } from "../matching/index.js";
import { createEmptyStats, createObjective, type GameStats, type Objective, type ObjectiveDefinition, type ObjectiveProgress } from "../objectives/index.js";
import type { EngineRegistries } from "../state/session.js";
import { createRandomSource, type RandomSource } from "../random/index.js";
import { issue, throwIfErrors } from "../validation.js";
import { explainInteraction, type InteractionExplanation } from "../board/explain.js";
import { inspectPlayableBoard, type BoardInspection } from "../debug/inspect.js";

export interface PlaygroundOptions {
  document: BoardDocument;
  registries: EngineRegistries;
  seed: string;
  /** Laboratory default: leave authored matches visible. */
  resolveInitialMatches?: boolean;
  /** Laboratory default: keep dead boards visible until recovery is invoked. */
  autoRecover?: boolean;
}

export interface SwapResult {
  ok: boolean;
  reason?: string;
  cascade?: CascadeReport;
}

export class BoardPlayground {
  readonly document: BoardDocument;
  readonly definition: BoardDefinition;
  readonly matchRules: MatchRules;
  readonly iconPool: string[];
  readonly registries: EngineRegistries;
  readonly seed: string;
  board: Board;
  stats: GameStats;
  lastCascade: CascadeReport | null = null;
  cascadeCount = 0;
  private random: RandomSource;
  private readonly objective: Objective | null;

  constructor(options: PlaygroundOptions) {
    this.document = options.document;
    this.definition = compileBoardDocument(options.document);
    this.matchRules = options.document.matchRules ?? defaultLabMatchRules();
    this.iconPool = options.document.iconPool ?? ["dev.spark-a", "dev.spark-b", "dev.spark-c"];
    this.registries = options.registries;
    this.seed = options.seed;
    this.random = createRandomSource(options.seed);
    this.stats = createEmptyStats();
    this.objective = options.document.demoObjective
      ? createObjective(options.document.demoObjective as ObjectiveDefinition)
      : null;
    this.board = this.placeBoard();
    if (options.resolveInitialMatches) {
      this.resolveMatches();
    }
    if (options.autoRecover) {
      this.recoverIfDead();
    }
  }

  inspect(): BoardInspection & { cascadeCount: number; objective: ObjectiveProgress | null; seed: string } {
    return {
      ...inspectPlayableBoard(this.board, this.matchRules, this.registries.icons, this.registries.obstacles),
      cascadeCount: this.cascadeCount,
      objective: this.objectiveProgress(),
      seed: this.seed,
    };
  }

  legalMoves(): SwapMove[] {
    return listValidMoves(this.board, this.matchRules, this.registries.icons, this.registries.obstacles);
  }

  matches(): MatchGroup[] {
    return detectMatches(this.board, this.matchRules, this.registries.icons);
  }

  isDead(): boolean {
    return isDeadBoard(this.board, this.matchRules, this.registries.icons, this.registries.obstacles);
  }

  explain(a: string, b: string): InteractionExplanation {
    return explainInteraction(this.board, a, b, this.registries.obstacles);
  }

  swap(a: string, b: string, requireMatch = true): SwapResult {
    if (!canAttemptSwap(this.board, a, b, this.registries.obstacles)) {
      return { ok: false, reason: `Cannot swap "${a}" and "${b}": they are not graph-adjacent (or a blocker forbids it).` };
    }
    swapOccupants(this.board, a, b);
    if (requireMatch && this.matches().length === 0) {
      swapOccupants(this.board, a, b);
      return { ok: false, reason: "That swap does not create a match." };
    }
    const cascade = this.resolveMatches();
    return { ok: true, cascade };
  }

  forceOccupants(occupants: Record<string, string | null>): void {
    for (const [cellId, iconId] of Object.entries(occupants)) {
      getCell(this.board, cellId).occupant = iconId ? { type: "icon", iconId } : { type: "empty" };
    }
  }

  resolveNow(): CascadeReport {
    return this.resolveMatches();
  }

  recoverIfDead(): RecoveryResult {
    const fairness = this.document.fairness ?? { onDeadBoard: "shuffle", maxShuffleAttempts: 32 };
    return recoverDeadBoard(
      this.board,
      this.matchRules,
      this.registries.icons,
      this.registries.obstacles,
      this.random.fork("dead-board"),
      fairness.onDeadBoard,
      fairness.maxShuffleAttempts ?? 32,
    );
  }

  objectiveProgress(): ObjectiveProgress | null {
    if (!this.objective) {
      return null;
    }
    const occupiedIcons: Record<string, string | null> = {};
    const hiddenCellIds: string[] = [];
    for (const id of this.board.topology.cellIds) {
      const cell = getCell(this.board, id);
      occupiedIcons[id] = cell.occupant.type === "icon" ? cell.occupant.iconId : null;
      if (cell.flags.hidden) {
        hiddenCellIds.push(id);
      }
    }
    return this.objective.evaluate({
      stats: this.stats,
      movesRemaining: null,
      occupiedIcons,
      hiddenCellIds,
    });
  }

  rngSnapshot() {
    return this.random.snapshot();
  }

  private placeBoard(): Board {
    const board = createBoard(this.definition);
    const mode = this.document.placement?.mode ?? "authored";
    if (mode !== "seeded-random") {
      return board;
    }
    const rng = this.random.fork(`placement:${this.document.placement?.seedSalt ?? this.seed}`);
    for (const cellId of board.topology.cellIds) {
      const cell = getCell(board, cellId);
      if (!cell.flags.active || cell.occupant.type === "icon") {
        continue;
      }
      cell.occupant = { type: "icon", iconId: rng.pick(this.iconPool) };
    }
    return board;
  }

  private resolveMatches(): CascadeReport {
    const report = runCascade({
      board: this.board,
      matchRules: this.matchRules,
      iconRegistry: this.registries.icons,
      obstacleRegistry: this.registries.obstacles,
      iconPool: this.iconPool,
      random: this.random,
      stats: this.stats,
      scoreForMatch: (group, combo) => group.cellIds.length * 10 * combo,
    });
    this.lastCascade = report;
    this.cascadeCount = report.combo;
    return report;
  }
}

export function startPlayground(options: PlaygroundOptions): BoardPlayground {
  return new BoardPlayground(options);
}

export function assertGraphSwap(board: Board, a: string, b: string, obstacles: EngineRegistries["obstacles"]): void {
  if (!canAttemptSwap(board, a, b, obstacles)) {
    throwIfErrors(
      [issue("swap.not_graph_adjacent", "swap", `Swap of "${a}" and "${b}" is illegal: no topology edge permits it.`)],
      "Illegal graph swap",
    );
  }
}

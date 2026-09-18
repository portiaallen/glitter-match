import type { CellId, IconId } from "../ids.js";
import type { Board } from "../board/index.js";
import { getCell, settleFlow } from "../board/index.js";
import type { IconRegistry } from "../icons/index.js";
import { detectMatches, matchedCellIds, type MatchGroup, type MatchRules } from "../matching/index.js";
import { applyObstacleMatchEffects, type ObstacleRegistry } from "../obstacles/index.js";
import type { RandomSource } from "../random/index.js";
import type { GameStats } from "../objectives/index.js";

export type CascadePhase =
  | "detect"
  | "resolve"
  | "effects"
  | "move"
  | "refill"
  | "complete";

export interface CascadeStep {
  phase: CascadePhase;
  combo: number;
  matches: MatchGroup[];
  clearedCellIds: CellId[];
  moved: Array<{ from: CellId; to: CellId; iconId: IconId }>;
  filled: Array<{ cellId: CellId; iconId: IconId }>;
}

export interface CascadeReport {
  steps: CascadeStep[];
  combo: number;
  stable: boolean;
}

export interface CascadeContext {
  board: Board;
  matchRules: MatchRules;
  iconRegistry: IconRegistry;
  obstacleRegistry: ObstacleRegistry;
  iconPool: IconId[];
  random: RandomSource;
  stats: GameStats;
  scoreForMatch: (group: MatchGroup, combo: number) => number;
  maxCombos?: number;
}

function defaultScore(group: MatchGroup, combo: number): number {
  return group.cellIds.length * 10 * combo;
}

export function runCascade(ctx: CascadeContext): CascadeReport {
  const steps: CascadeStep[] = [];
  let combo = 0;
  const scoreForMatch = ctx.scoreForMatch ?? defaultScore;
  const maxCombos = ctx.maxCombos ?? 64;

  while (true) {
    const matches = detectMatches(ctx.board, ctx.matchRules, ctx.iconRegistry);
    steps.push(emptyStep("detect", combo, matches));
    if (matches.length === 0) {
      break;
    }
    combo += 1;
    if (combo > maxCombos) {
      throw new Error(`Cascade exceeded ${maxCombos} combos. Check refill rules to prevent infinite loops.`);
    }
    ctx.stats.maxCombo = Math.max(ctx.stats.maxCombo, combo);

    const clearedCellIds = matchedCellIds(matches);
    resolveMatches(ctx, matches, combo, scoreForMatch);
    steps.push({
      ...emptyStep("resolve", combo, matches),
      clearedCellIds,
    });

    applyObstacleMatchEffects(ctx.board, matches, ctx.obstacleRegistry);
    steps.push(emptyStep("effects", combo, matches));

    const settlement = settleFlow(ctx.board);
    steps.push({
      ...emptyStep("move", combo, []),
      moved: settlement.moves.flatMap((move) =>
        move.occupant.type === "icon" ? [{ from: move.from, to: move.to, iconId: move.occupant.iconId }] : [],
      ),
    });

    const filled = refillBoard(ctx);
    steps.push({
      ...emptyStep("refill", combo, []),
      filled,
    });
  }

  if (combo > 0) {
    ctx.stats.cascadesCompleted += 1;
  }

  steps.push(emptyStep("complete", combo, []));
  return { steps, combo, stable: true };
}

function resolveMatches(
  ctx: CascadeContext,
  matches: MatchGroup[],
  combo: number,
  scoreForMatch: (group: MatchGroup, combo: number) => number,
): void {
  const seen = new Set<CellId>();
  for (const group of matches) {
    ctx.stats.score += scoreForMatch(group, combo);
    for (const cellId of group.cellIds) {
      if (seen.has(cellId)) {
        continue;
      }
      seen.add(cellId);
      const cell = getCell(ctx.board, cellId);
      if (cell.occupant.type === "icon") {
        const iconId = cell.occupant.iconId;
        if (iconId === group.colorIconId) {
          ctx.stats.collectedIcons[iconId] = (ctx.stats.collectedIcons[iconId] ?? 0) + 1;
        }
      }
      ctx.stats.clearedCellCounts[cellId] = (ctx.stats.clearedCellCounts[cellId] ?? 0) + 1;
      if (cell.flags.hidden) {
        cell.flags.hidden = false;
        ctx.stats.revealedCellIds.push(cellId);
      }
      if (!cell.flags.protected) {
        cell.occupant = { type: "empty" };
      }
    }
  }
}

export function refillBoard(ctx: CascadeContext): Array<{ cellId: CellId; iconId: IconId }> {
  const filled: Array<{ cellId: CellId; iconId: IconId }> = [];
  const refill = ctx.board.topology.movement.refill;
  if (refill.mode === "none") {
    return filled;
  }

  const sources = (refill.sourceCellIds ?? ctx.board.topology.spawnSources).slice().sort();
  const maxAttempts = refill.maxAvoidAttempts ?? 8;

  for (const cellId of sources) {
    const cell = getCell(ctx.board, cellId);
    if (!cell.flags.active || cell.occupant.type !== "empty") {
      continue;
    }
    let chosen: IconId | null = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = ctx.random.pick(ctx.iconPool);
      cell.occupant = { type: "icon", iconId: candidate };
      if (!refill.avoidImmediateMatches) {
        chosen = candidate;
        break;
      }
      const matches = detectMatches(ctx.board, ctx.matchRules, ctx.iconRegistry);
      const createsMatch = matches.some((group) => group.cellIds.includes(cellId));
      if (!createsMatch) {
        chosen = candidate;
        break;
      }
      cell.occupant = { type: "empty" };
    }
    if (!chosen) {
      chosen = ctx.random.pick(ctx.iconPool);
      cell.occupant = { type: "icon", iconId: chosen };
    }
    filled.push({ cellId, iconId: chosen });
  }

  if (ctx.board.topology.movement.mode === "along-flow") {
    settleFlow(ctx.board);
    for (const cellId of sources) {
      const cell = getCell(ctx.board, cellId);
      if (cell.flags.active && cell.occupant.type === "empty" && ctx.iconPool.length > 0) {
        const iconId = ctx.random.pick(ctx.iconPool);
        cell.occupant = { type: "icon", iconId };
        filled.push({ cellId, iconId });
      }
    }
    settleFlow(ctx.board);
  }

  return filled;
}

function emptyStep(phase: CascadePhase, combo: number, matches: MatchGroup[]): CascadeStep {
  return {
    phase,
    combo,
    matches,
    clearedCellIds: [],
    moved: [],
    filled: [],
  };
}

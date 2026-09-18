import type { CellId, IconId, ObjectiveId } from "../ids.js";

export const OBJECTIVE_TYPES = [
  "collection",
  "clearing",
  "path",
  "score",
  "combo",
  "precision",
  "survival",
  "pattern",
  "discovery",
  "multi-stage",
  "hybrid",
] as const;

export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

export interface ObjectiveProgress {
  current: number;
  target: number;
  complete: boolean;
  failed?: boolean;
  label: string;
}

export interface GameStats {
  collectedIcons: Record<IconId, number>;
  clearedCellCounts: Record<CellId, number>;
  revealedCellIds: CellId[];
  score: number;
  maxCombo: number;
  movesUsed: number;
  cascadesCompleted: number;
}

export interface ObjectiveEvaluationContext {
  stats: GameStats;
  movesRemaining: number | null;
  occupiedIcons: Record<CellId, IconId | null>;
  hiddenCellIds: CellId[];
}

export interface ObjectiveDefinition {
  id: ObjectiveId;
  type: ObjectiveType;
  iconId?: IconId;
  count?: number;
  score?: number;
  combo?: number;
  moves?: number;
  cascades?: number;
  startCellId?: CellId;
  endCellId?: CellId;
  cellIds?: CellId[];
  iconByCell?: Record<CellId, IconId>;
  stages?: ObjectiveDefinition[];
  children?: ObjectiveDefinition[];
  mode?: "all" | "any";
}

export interface Objective {
  definition: ObjectiveDefinition;
  evaluate(ctx: ObjectiveEvaluationContext): ObjectiveProgress;
}

function progress(current: number, target: number, label: string, failed = false): ObjectiveProgress {
  return { current, target, complete: !failed && current >= target, failed, label };
}

export function createObjective(definition: ObjectiveDefinition): Objective {
  return {
    definition,
    evaluate(ctx: ObjectiveEvaluationContext): ObjectiveProgress {
      switch (definition.type) {
        case "collection": {
          const iconId = required(definition.iconId, "collection.iconId");
          const target = required(definition.count, "collection.count");
          const current = ctx.stats.collectedIcons[iconId] ?? 0;
          return progress(current, target, `Collect ${target} ${iconId}`);
        }
        case "clearing": {
          const cellIds = required(definition.cellIds, "clearing.cellIds");
          const current = cellIds.filter((id) => (ctx.stats.clearedCellCounts[id] ?? 0) > 0).length;
          return progress(current, cellIds.length, "Clear marked cells");
        }
        case "path": {
          const start = required(definition.startCellId, "path.startCellId");
          const end = required(definition.endCellId, "path.endCellId");
          const cleared = (id: CellId) => (ctx.stats.clearedCellCounts[id] ?? 0) > 0;
          const current = Number(cleared(start)) + Number(cleared(end));
          return progress(current, 2, `Open path ${start} → ${end}`);
        }
        case "score": {
          const target = required(definition.score, "score.score");
          return progress(ctx.stats.score, target, `Score ${target}`);
        }
        case "combo": {
          const target = required(definition.combo, "combo.combo");
          return progress(ctx.stats.maxCombo, target, `Reach combo ${target}`);
        }
        case "precision": {
          const remainingNeeded = required(definition.moves, "precision.moves");
          const remaining = ctx.movesRemaining ?? 0;
          const complete = ctx.stats.score > 0 && remaining >= remainingNeeded;
          return {
            current: remaining,
            target: remainingNeeded,
            complete,
            label: `Win with ≥ ${remainingNeeded} moves remaining`,
          };
        }
        case "survival": {
          const target = required(definition.cascades, "survival.cascades");
          return progress(ctx.stats.cascadesCompleted, target, `Survive ${target} cascades`);
        }
        case "pattern": {
          const iconByCell = required(definition.iconByCell, "pattern.iconByCell");
          const entries = Object.entries(iconByCell);
          const current = entries.filter(([cellId, iconId]) => ctx.occupiedIcons[cellId] === iconId).length;
          return progress(current, entries.length, "Form the authored pattern");
        }
        case "discovery": {
          const cellIds = required(definition.cellIds, "discovery.cellIds");
          const revealed = new Set(ctx.stats.revealedCellIds);
          const current = cellIds.filter((id) => revealed.has(id) || !ctx.hiddenCellIds.includes(id)).length;
          return progress(current, cellIds.length, "Reveal hidden cells");
        }
        case "multi-stage": {
          const stages = required(definition.stages, "multi-stage.stages");
          let completed = 0;
          for (const stage of stages) {
            const result = createObjective(stage).evaluate(ctx);
            if (!result.complete) {
              break;
            }
            completed += 1;
          }
          return progress(completed, stages.length, "Complete stages in order");
        }
        case "hybrid": {
          const children = required(definition.children, "hybrid.children");
          const results = children.map((child) => createObjective(child).evaluate(ctx));
          const mode = definition.mode ?? "all";
          const current = results.filter((result) => result.complete).length;
          const target = mode === "any" ? 1 : children.length;
          const complete = mode === "any" ? current >= 1 : current === children.length;
          return { current, target, complete, label: mode === "any" ? "Complete any objective" : "Complete all objectives" };
        }
        default: {
          const never: never = definition.type;
          throw new Error(`Unknown objective type: ${never}`);
        }
      }
    },
  };
}

function required<T>(value: T | undefined, path: string): T {
  if (value === undefined) {
    throw new Error(`Objective is missing required field ${path}.`);
  }
  return value;
}

export function createEmptyStats(): GameStats {
  return {
    collectedIcons: {},
    clearedCellCounts: {},
    revealedCellIds: [],
    score: 0,
    maxCombo: 0,
    movesUsed: 0,
    cascadesCompleted: 0,
  };
}

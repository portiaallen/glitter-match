import type { Board } from "../board/index.js";
import type { CellId, IconId, ObjectiveId } from "../ids.js";
import type { CompositionOp, CountUnit, EvaluationPhase, ObjectiveEvent, ObjectiveRole, TargetKind } from "./types.js";

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
  status?: "INCOMPLETE" | "COMPLETE" | "FAILED";
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
  moveLimit?: number | null;
  occupiedIcons: Record<CellId, IconId | null>;
  hiddenCellIds: CellId[];
  board?: Board;
  phase?: EvaluationPhase;
  events?: ObjectiveEvent[];
}

export interface ObjectiveDefinition {
  id: ObjectiveId;
  type: ObjectiveType;
  version?: string;
  role?: ObjectiveRole;
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
  composition?: CompositionOp;
  dependsOn?: string[];
  countUnit?: CountUnit;
  targetKind?: TargetKind;
  countPlayerMatches?: boolean;
  countCascades?: boolean;
  countSpecialMatches?: boolean;
  countObstacles?: boolean;
  maxCount?: number;
  pathMode?: "cleared-endpoints" | "graph";
  minPathLength?: number;
  patternId?: string;
  comboEvents?: string[];
  forbiddenEvents?: string[];
  surviveMoves?: number;
  accessibilityLabel?: string;
}

export interface Objective {
  definition: ObjectiveDefinition;
  evaluate(ctx: ObjectiveEvaluationContext): ObjectiveProgress;
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

export function requiredField<T>(value: T | undefined, path: string): T {
  if (value === undefined) {
    throw new Error(`Objective is missing required field ${path}.`);
  }
  return value;
}

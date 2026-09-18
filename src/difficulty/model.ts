import { z } from "zod";

/**
 * Multidimensional difficulty. This is not easy/medium/hard.
 * Scale is 0–10 on every axis so ratings can be compared and later analyzed.
 * Adaptive difficulty is out of scope.
 */
export const DIFFICULTY_DIMENSIONS = [
  "movePressure",
  "topologyComplexity",
  "obstacleDensity",
  "objectiveComplexity",
  "mechanicComplexity",
  "planningDepth",
  "cascadeDependency",
  "rngSensitivity",
  "timingDemand",
  "spatialAwareness",
  "precision",
  "multitasking",
  "recoveryDifficulty",
] as const;

export type DifficultyDimension = (typeof DIFFICULTY_DIMENSIONS)[number];

export const DIFFICULTY_SCALE = { min: 0, max: 10 } as const;

export type DifficultyVector = Record<DifficultyDimension, number>;

export interface DifficultyRating extends Partial<DifficultyVector> {
  authored?: Partial<DifficultyVector>;
  notes?: string;
  /** Legacy aliases kept so early development fixtures still parse. */
  cognitive?: number;
  spatial?: number;
  timing?: number;
  scarcity?: number;
}

function dimensionValue(rating: DifficultyRating, dimension: DifficultyDimension): number | undefined {
  return rating.authored?.[dimension] ?? rating[dimension];
}

const dimensionSchema = z.number().min(DIFFICULTY_SCALE.min).max(DIFFICULTY_SCALE.max);

export const difficultySchema = z
  .object({
    movePressure: dimensionSchema.optional(),
    topologyComplexity: dimensionSchema.optional(),
    obstacleDensity: dimensionSchema.optional(),
    objectiveComplexity: dimensionSchema.optional(),
    mechanicComplexity: dimensionSchema.optional(),
    planningDepth: dimensionSchema.optional(),
    cascadeDependency: dimensionSchema.optional(),
    rngSensitivity: dimensionSchema.optional(),
    timingDemand: dimensionSchema.optional(),
    spatialAwareness: dimensionSchema.optional(),
    precision: dimensionSchema.optional(),
    multitasking: dimensionSchema.optional(),
    recoveryDifficulty: dimensionSchema.optional(),
    cognitive: dimensionSchema.optional(),
    spatial: dimensionSchema.optional(),
    timing: dimensionSchema.optional(),
    scarcity: dimensionSchema.optional(),
    notes: z.string().optional(),
  })
  .strict();

export function emptyDifficultyVector(): DifficultyVector {
  return {
    movePressure: 0,
    topologyComplexity: 0,
    obstacleDensity: 0,
    objectiveComplexity: 0,
    mechanicComplexity: 0,
    planningDepth: 0,
    cascadeDependency: 0,
    rngSensitivity: 0,
    timingDemand: 0,
    spatialAwareness: 0,
    precision: 0,
    multitasking: 0,
    recoveryDifficulty: 0,
  };
}

export function isCompleteDifficulty(rating: DifficultyRating | undefined): rating is DifficultyRating & {
  authored: DifficultyVector;
} {
  if (!rating) {
    return false;
  }
  return DIFFICULTY_DIMENSIONS.every((dimension) => {
    const value = dimensionValue(rating, dimension);
    return typeof value === "number" && value >= DIFFICULTY_SCALE.min && value <= DIFFICULTY_SCALE.max;
  });
}

export function compareDifficulty(a: DifficultyVector, b: DifficultyVector): Record<DifficultyDimension, number> {
  const delta = {} as Record<DifficultyDimension, number>;
  for (const dimension of DIFFICULTY_DIMENSIONS) {
    delta[dimension] = a[dimension] - b[dimension];
  }
  return delta;
}

export function vectorFromRating(rating: DifficultyRating): Partial<DifficultyVector> {
  const vector: Partial<DifficultyVector> = { ...rating.authored };
  for (const dimension of DIFFICULTY_DIMENSIONS) {
    const direct = dimensionValue(rating, dimension);
    if (typeof direct === "number") {
      vector[dimension] = direct;
    }
  }
  return vector;
}

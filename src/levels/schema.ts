import { z } from "zod";
import { LAND_IDS } from "../ids.js";
import { OBJECTIVE_TYPES } from "../objectives/model.js";
import { REWARD_KINDS } from "../economy/rewards.js";
import {
  cellSchema,
  edgeSchema,
  flowSchema,
  matchRulesSchema,
  movementSchema,
  obstaclePlacementSchema,
  portalSchema,
  sectionSchema,
  topologySchema,
} from "../board/schema.js";

const objectiveSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      type: z.enum(OBJECTIVE_TYPES),
      iconId: z.string().optional(),
      count: z.number().int().positive().optional(),
      score: z.number().int().nonnegative().optional(),
      combo: z.number().int().positive().optional(),
      moves: z.number().int().nonnegative().optional(),
      cascades: z.number().int().positive().optional(),
      startCellId: z.string().optional(),
      endCellId: z.string().optional(),
      cellIds: z.array(z.string()).optional(),
      iconByCell: z.record(z.string()).optional(),
      stages: z.array(objectiveSchema).optional(),
      children: z.array(objectiveSchema).optional(),
      mode: z.enum(["all", "any"]).optional(),
    })
    .strict(),
);

const rewardSchema = z
  .object({
    kind: z.enum(REWARD_KINDS),
    id: z.string().optional(),
    amount: z.number(),
  })
  .strict();

const difficultySchema = z
  .object({
    cognitive: z.number().min(0).max(10).optional(),
    spatial: z.number().min(0).max(10).optional(),
    timing: z.number().min(0).max(10).optional(),
    scarcity: z.number().min(0).max(10).optional(),
    notes: z.string().optional(),
  })
  .strict();

export const levelDefinitionSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["development", "production"]),
    land: z.enum(LAND_IDS),
    title: z.string().min(1),
    board: z
      .object({
        topology: topologySchema,
        cells: z.array(cellSchema).min(1),
        adjacency: z.array(edgeSchema).min(1),
        flow: z.array(flowSchema).optional(),
        portals: z.array(portalSchema).optional(),
        sections: z.array(sectionSchema).optional(),
        movement: movementSchema.optional(),
        portalsConductMatches: z.boolean().optional(),
        portalsAllowSwap: z.boolean().optional(),
      })
      .strict(),
    iconPool: z.array(z.string().min(1)).min(1),
    matchRules: matchRulesSchema,
    movementRules: movementSchema.optional(),
    objective: objectiveSchema,
    obstacles: z.array(obstaclePlacementSchema).optional(),
    mechanics: z.array(z.string()).optional(),
    difficulty: difficultySchema.optional(),
    moveLimit: z.number().int().positive().nullable(),
    timerMs: z.number().int().positive().nullable().optional(),
    twist: z.string().optional(),
    secret: z.string().optional(),
    mastery: z
      .object({
        maxMovesUsed: z.number().int().positive().optional(),
        minScore: z.number().int().nonnegative().optional(),
        noSpecialIcons: z.boolean().optional(),
      })
      .strict()
      .optional(),
    rewards: z.array(rewardSchema).optional(),
    placement: z
      .object({
        mode: z.enum(["authored", "seeded-random"]),
        seedSalt: z.string().optional(),
        avoidInitialMatches: z.boolean().optional(),
      })
      .strict(),
    swap: z
      .object({
        requireMatch: z.boolean(),
      })
      .strict()
      .optional(),
    fairness: z
      .object({
        onDeadBoard: z.enum(["shuffle", "fail"]),
        maxShuffleAttempts: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    specialIconsAllowed: z.boolean().optional(),
  })
  .strict();

export type LevelDefinition = z.infer<typeof levelDefinitionSchema>;

export function parseLevelJson(input: unknown): LevelDefinition {
  return levelDefinitionSchema.parse(input);
}

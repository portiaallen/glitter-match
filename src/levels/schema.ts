import { z } from "zod";
import { LAND_IDS } from "../ids.js";
import { TOPOLOGY_KINDS } from "../board/topology.js";
import { MATCH_MODES } from "../matching/types.js";
import { OBJECTIVE_TYPES } from "../objectives/model.js";
import { REWARD_KINDS } from "../economy/rewards.js";

const positionSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    z: z.number().optional(),
  })
  .strict();

const obstaclePlacementSchema = z
  .object({
    type: z.string().min(1),
    durability: z.number().int().positive().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .strict();

const cellSchema = z
  .object({
    id: z.string().min(1),
    position: positionSchema,
    active: z.boolean().optional(),
    terrain: z.string().optional(),
    hidden: z.boolean().optional(),
    protected: z.boolean().optional(),
    frozen: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    sectionId: z.string().optional(),
    initialIcon: z.string().optional(),
    initialObstacles: z.array(obstaclePlacementSchema).optional(),
  })
  .strict();

const edgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    direction: z.string().optional(),
    bidirectional: z.boolean().optional(),
    kind: z.enum(["adjacent", "portal", "bridge"]).optional(),
  })
  .strict();

const flowSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .strict();

const portalSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    bidirectional: z.boolean().optional(),
    conductsMatches: z.boolean().optional(),
    allowsSwap: z.boolean().optional(),
  })
  .strict();

const sectionSchema = z
  .object({
    id: z.string().min(1),
    cellIds: z.array(z.string().min(1)).min(1),
    rotation: z
      .object({
        incrementDegrees: z.number(),
        rotatable: z.boolean(),
      })
      .strict()
      .optional(),
    chamber: z.string().optional(),
    layer: z.string().optional(),
  })
  .strict();

const topologySchema = z
  .object({
    kind: z.enum(TOPOLOGY_KINDS),
    notes: z.string().optional(),
    chambers: z.array(z.string()).optional(),
    layers: z.array(z.string()).optional(),
  })
  .strict();

const movementSchema = z
  .object({
    mode: z.enum(["none", "along-flow"]),
    refill: z
      .object({
        mode: z.enum(["none", "spawn-at-sources"]),
        sourceCellIds: z.array(z.string()).optional(),
        avoidImmediateMatches: z.boolean().optional(),
        maxAvoidAttempts: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();

const matchRulesSchema = z
  .object({
    minGroupSize: z.number().int().min(2),
    modes: z.array(z.enum(MATCH_MODES)).min(1),
  })
  .strict();

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

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
import { difficultySchema } from "../difficulty/model.js";
import {
  levelMovementModelSchema,
  pacingRoleSchema,
  ruleOfThreeSchema,
  symmetrySchema,
  timerConfigSchema,
} from "../dna/contracts.js";
import { twistContractSchema } from "../twists/contract.js";
import { discoveryContractSchema, secretContractSchema } from "../secrets/contract.js";
import { gateReferenceSchema } from "../gates/contract.js";
import {
  museumReferenceSchema,
  personalStoryReferenceSchema,
  sanctuaryReferenceSchema,
} from "../universe/references.js";
import { levelAccessibilitySchema } from "../ui/level-accessibility.js";
import { MATCH_CONTRACT_IDS } from "../matching/contracts.js";
import { SCHEMA_VERSION } from "../content/versions.js";

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
      dependsOn: z.array(z.string().min(1)).optional(),
      accessibilityLabel: z.string().optional(),
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

const expandedMatchRulesSchema = matchRulesSchema.extend({
  contracts: z.array(z.enum(MATCH_CONTRACT_IDS)).optional(),
  orientationLabels: z.record(z.array(z.string().min(1))).optional(),
});

const masterySchema = z
  .object({
    maxMovesUsed: z.number().int().positive().optional(),
    minScore: z.number().int().nonnegative().optional(),
    noSpecialIcons: z.boolean().optional(),
    optionalObjectives: z.array(objectiveSchema).optional(),
    rewardRef: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

/**
 * Level DNA contract.
 *
 * Board Shape + Topology + Symmetry + Movement + Match Rules + Icon Pool +
 * Objective + Obstacles + Land Mechanic + Difficulty + Twist + Secret +
 * Mastery + Story + Rewards
 *
 * 640 campaign levels are future content. They are not part of this schema's
 * implementation — only the contract that will author them later.
 */
export const levelDefinitionSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(["development", "production"]),
    land: z.enum(LAND_IDS),
    title: z.string().min(1),
    schemaVersion: z.string().min(1).optional(),
    contentVersion: z.string().min(1).optional(),
    purpose: z.enum(["engine-fixture", "contract-fixture", "campaign"]).optional(),
    shape: z.string().optional(),
    symmetry: symmetrySchema.optional(),
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
    matchRules: expandedMatchRulesSchema,
    movementRules: movementSchema.optional(),
    movementModel: levelMovementModelSchema.optional(),
    objective: objectiveSchema,
    objectives: z.array(objectiveSchema).optional(),
    obstacles: z.array(obstaclePlacementSchema).optional(),
    mechanics: z
      .array(
        z.union([
          z.string().min(1),
          z
            .object({
              id: z.string().min(1),
              priority: z.number().int().optional(),
            })
            .strict(),
        ]),
      )
      .optional(),
    difficulty: difficultySchema.optional(),
    pacing: pacingRoleSchema.optional(),
    ruleOfThree: ruleOfThreeSchema.optional(),
    moveLimit: z.number().int().positive().nullable(),
    timerMs: z.number().int().positive().nullable().optional(),
    timer: timerConfigSchema.optional(),
    twist: twistContractSchema.optional(),
    secret: secretContractSchema.optional(),
    discoveries: z.array(discoveryContractSchema).optional(),
    mastery: masterySchema.optional(),
    storyRef: personalStoryReferenceSchema.optional(),
    sanctuaryRef: sanctuaryReferenceSchema.optional(),
    museumRef: museumReferenceSchema.optional(),
    gateRef: gateReferenceSchema.optional(),
    rewards: z.array(rewardSchema).optional(),
    accessibility: levelAccessibilitySchema.optional(),
    validation: z
      .object({
        author: z.string().optional(),
        lastValidated: z.string().optional(),
        notes: z.string().optional(),
      })
      .strict()
      .optional(),
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

export const LEVEL_DNA_REQUIRED_FOR_PRODUCTION = [
  "schemaVersion",
  "contentVersion",
  "shape",
  "symmetry",
  "movementModel",
  "difficulty",
  "pacing",
  "ruleOfThree",
  "accessibility",
] as const;

export { SCHEMA_VERSION };

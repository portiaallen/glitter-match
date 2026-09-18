import { z } from "zod";

/** Rule of Three: Familiar + New + Surprising. Design metadata, not generated content. */
export const PACING_ROLES = [
  "rest",
  "standard",
  "escalation",
  "finale",
  "discovery",
  "mastery",
  "experimental",
] as const;

export type PacingRole = (typeof PACING_ROLES)[number];

export interface RuleOfThree {
  familiar: string[];
  new: string[];
  surprising: string[];
}

export const ruleOfThreeSchema = z
  .object({
    familiar: z.array(z.string().min(1)).min(1),
    new: z.array(z.string().min(1)).min(1),
    surprising: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const pacingRoleSchema = z.enum(PACING_ROLES);

export const SYMMETRY_KINDS = [
  "none",
  "mirror",
  "radial",
  "rotational",
  "paired",
  "asymmetric",
  "authored",
] as const;

export type SymmetryKind = (typeof SYMMETRY_KINDS)[number];

export const symmetrySchema = z
  .object({
    kind: z.enum(SYMMETRY_KINDS),
    notes: z.string().optional(),
  })
  .strict();

export const timerConfigSchema = z
  .object({
    enabled: z.boolean(),
    durationMs: z.number().int().positive().nullable(),
    failOnExpire: z.boolean().optional(),
  })
  .strict();

export interface TimerConfig {
  enabled: boolean;
  durationMs: number | null;
  failOnExpire?: boolean;
}

export const LEVEL_MOVEMENT_TRAVERSALS = ["graph"] as const;

export const levelMovementModelSchema = z
  .object({
    swap: z
      .object({
        allowed: z.boolean().default(true),
        requireMatch: z.boolean().default(true),
      })
      .strict()
      .optional(),
    constraints: z.array(z.string().min(1)).optional(),
    directional: z.boolean().optional(),
    rotation: z
      .object({
        enabled: z.boolean(),
        sectionIds: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    traversal: z.enum(LEVEL_MOVEMENT_TRAVERSALS).default("graph"),
    movementLimit: z.number().int().positive().nullable().optional(),
    timingMs: z.number().int().positive().nullable().optional(),
    specialPermissions: z.array(z.string().min(1)).optional(),
    notes: z.string().optional(),
  })
  .strict();

export type LevelMovementModel = z.infer<typeof levelMovementModelSchema>;

export const matchRuleContractSchema = z
  .object({
    minGroupSize: z.number().int().min(2),
    modes: z.array(z.string().min(1)).min(1),
    contracts: z.array(z.string().min(1)).optional(),
    orientationLabels: z.record(z.array(z.string().min(1))).optional(),
  })
  .strict();

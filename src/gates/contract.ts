import { z } from "zod";
import { LAND_IDS } from "../ids.js";

/**
 * Architectural contract for future Glitter Gates.
 * Assignment is server-authoritative. This phase stores references only.
 */
export const gateReferenceSchema = z
  .object({
    gateId: z.string().min(1),
    originLand: z.enum(LAND_IDS),
    destinationLand: z.enum(LAND_IDS),
    assignment: z
      .object({
        mode: z.enum(["unassigned", "server-authoritative"]),
        notes: z.string().optional(),
      })
      .strict(),
    playerStateDependency: z.string().optional(),
    performanceDependency: z.string().optional(),
    visualExperienceRef: z.string().optional(),
    rewardRef: z.string().optional(),
    memoryRef: z.string().optional(),
    loreRef: z.string().optional(),
  })
  .strict();

export type GateReference = z.infer<typeof gateReferenceSchema>;

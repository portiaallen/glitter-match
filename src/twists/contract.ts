import { z } from "zod";

export const TWIST_CATEGORIES = [
  "board",
  "objective",
  "movement",
  "timing",
  "information",
  "constraint",
  "presentation",
] as const;

export const twistContractSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(TWIST_CATEGORIES),
    activation: z.enum(["always", "on-start", "on-threshold", "on-discovery"]).default("always"),
    constraints: z.array(z.string().min(1)).optional(),
    stateRef: z.string().optional(),
    objectiveInteraction: z.string().optional(),
    accessibility: z
      .object({
        label: z.string().min(1),
        description: z.string().min(1),
        nonColorIndicator: z.string().min(1),
      })
      .strict(),
    serializationKey: z.string().min(1).optional(),
  })
  .strict();

export type TwistContract = z.infer<typeof twistContractSchema>;

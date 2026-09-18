import { z } from "zod";

/**
 * Secrets are optional discoveries. They are never required for core
 * completion unless the author also lists them as an objective.
 */
export const secretContractSchema = z
  .object({
    id: z.string().min(1),
    optional: z.literal(true).default(true),
    hidden: z.boolean().default(true),
    requiredForCompletion: z.boolean().default(false),
    trigger: z.string().min(1).optional(),
    discoveryStateKey: z.string().optional(),
    rewardRef: z.string().optional(),
    museumRef: z.string().optional(),
    loreRef: z.string().optional(),
    accessibility: z
      .object({
        label: z.string().min(1),
        description: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const discoveryContractSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum([
      "discovery-moment",
      "hidden-element",
      "optional-discovery",
      "environmental-reveal",
      "rare-event",
      "secret-achievement",
      "lore-discovery",
    ]),
    requiredForCompletion: z.boolean().default(false),
    secretRef: z.string().optional(),
    accessibility: z
      .object({
        label: z.string().min(1),
        description: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SecretContract = z.infer<typeof secretContractSchema>;
export type DiscoveryContract = z.infer<typeof discoveryContractSchema>;

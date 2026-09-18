import { z } from "zod";

/**
 * Reference contracts only. Sanctuary, Museum, and Personal Story
 * are not implemented in this phase.
 */
export const sanctuaryReferenceSchema = z
  .object({
    kind: z.literal("sanctuary"),
    slotId: z.string().min(1),
    collectibleRef: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

export const museumReferenceSchema = z
  .object({
    kind: z.literal("museum"),
    entryId: z.string().min(1),
    catalog: z.enum(["icon", "artifact", "lore", "rare-event", "discovery", "memory"]),
    notes: z.string().optional(),
  })
  .strict();

export const personalStoryReferenceSchema = z
  .object({
    kind: z.literal("personal-story"),
    beatId: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict();

export type SanctuaryReference = z.infer<typeof sanctuaryReferenceSchema>;
export type MuseumReference = z.infer<typeof museumReferenceSchema>;
export type PersonalStoryReference = z.infer<typeof personalStoryReferenceSchema>;

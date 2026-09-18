import { z } from "zod";

export const levelAccessibilitySchema = z
  .object({
    largeText: z.boolean(),
    highContrast: z.boolean(),
    nonColorOnly: z.boolean(),
    largeTouchTargets: z.boolean(),
    reducedMotion: z.boolean(),
    audioCues: z.boolean(),
    haptics: z.boolean(),
    readableObjective: z.string().min(1),
    reflowFriendly: z.boolean(),
    visualStateIndicators: z.array(z.string().min(1)).min(1),
    minHitTargetPx: z.number().int().min(44).optional(),
    textScale: z.number().positive().optional(),
  })
  .strict();

export type LevelAccessibility = z.infer<typeof levelAccessibilitySchema>;

export const DEFAULT_LEVEL_ACCESSIBILITY: LevelAccessibility = {
  largeText: true,
  highContrast: true,
  nonColorOnly: true,
  largeTouchTargets: true,
  reducedMotion: false,
  audioCues: true,
  haptics: true,
  readableObjective: "Progress is announced as numbers and cell names, never color alone.",
  reflowFriendly: true,
  visualStateIndicators: ["pattern", "label", "shape"],
  minHitTargetPx: 44,
  textScale: 1,
};

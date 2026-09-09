import { z } from "zod";
import { LAND_IDS } from "../ids.js";
import { CONTENT_VERSION, SCHEMA_VERSION } from "./versions.js";

/**
 * Universe → Land → Level Pack → Level
 * Packs are independently versionable. Remote delivery is out of scope.
 */
export const UNIVERSE_ID = "glitter-universe" as const;

export const levelPackManifestSchema = z
  .object({
    id: z.string().min(1),
    universeId: z.literal(UNIVERSE_ID),
    land: z.enum(LAND_IDS),
    title: z.string().min(1),
    schemaVersion: z.string().min(1),
    contentVersion: z.string().min(1),
    levelIds: z.array(z.string().min(1)),
    status: z.enum(["development", "production"]),
    notes: z.string().optional(),
  })
  .strict();

export type LevelPackManifest = z.infer<typeof levelPackManifestSchema>;

export function emptyArchitecturePack(land: (typeof LAND_IDS)[number]): LevelPackManifest {
  return {
    id: `${land}.architecture`,
    universeId: UNIVERSE_ID,
    land,
    title: `${land} architecture pack (no campaign levels)`,
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    levelIds: [],
    status: "development",
    notes: "640 levels are future content. This pack exists so versioning and hierarchy can be tested.",
  };
}

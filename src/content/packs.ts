import { createLandRegistry, type LandRegistry } from "../lands/index.js";
import { createMatchRuleRegistry, type MatchRuleRegistry } from "../matching/contracts.js";
import { createMechanicRegistry, type MechanicRegistry } from "../mechanics/index.js";
import { createObjectiveRegistry, type ObjectiveRegistry } from "../objectives/registry.js";
import { createObstacleRegistry, type ObstacleRegistry } from "../obstacles/index.js";
import { createProductionIconRegistry } from "./production-icons.js";
import { registerDevIcons } from "./dev-icons.js";
import type { IconRegistry } from "../icons/index.js";
import { CONTENT_VERSION, SCHEMA_VERSION } from "./versions.js";

export interface EnginePack {
  lands: LandRegistry;
  icons: IconRegistry;
  obstacles: ObstacleRegistry;
  mechanics: MechanicRegistry;
  objectives: ObjectiveRegistry;
  matchContracts: MatchRuleRegistry;
  schemaVersion: string;
  contentVersion: string;
}

export function createProductionPack(): EnginePack {
  return {
    lands: createLandRegistry(),
    icons: createProductionIconRegistry(),
    obstacles: createObstacleRegistry(),
    mechanics: createMechanicRegistry(),
    objectives: createObjectiveRegistry(),
    matchContracts: createMatchRuleRegistry(),
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
  };
}

/** Engine pack plus development icons. Never use for production validation. */
export function createDevelopmentPack(): EnginePack {
  const pack = createProductionPack();
  registerDevIcons(pack.icons);
  return pack;
}

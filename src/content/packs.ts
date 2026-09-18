import { createLandRegistry, type LandRegistry } from "../lands/index.js";
import { createMechanicRegistry, type MechanicRegistry } from "../mechanics/index.js";
import { createObstacleRegistry, type ObstacleRegistry } from "../obstacles/index.js";
import { createProductionIconRegistry } from "./production-icons.js";
import { registerDevIcons } from "./dev-icons.js";
import type { IconRegistry } from "../icons/index.js";

export interface EnginePack {
  lands: LandRegistry;
  icons: IconRegistry;
  obstacles: ObstacleRegistry;
  mechanics: MechanicRegistry;
}

export function createProductionPack(): EnginePack {
  return {
    lands: createLandRegistry(),
    icons: createProductionIconRegistry(),
    obstacles: createObstacleRegistry(),
    mechanics: createMechanicRegistry(),
  };
}

/** Engine pack plus development icons. Never use for production validation. */
export function createDevelopmentPack(): EnginePack {
  const pack = createProductionPack();
  registerDevIcons(pack.icons);
  return pack;
}

import { createEmptyIconRegistry, type IconRegistry } from "../icons/index.js";
import { SPECIAL_ICON_CATALOG } from "../special-icons/index.js";

export function registerUniversalSpecialIcons(registry: IconRegistry): void {
  for (const special of SPECIAL_ICON_CATALOG) {
    registry.register({
      id: special.id,
      kind: "special",
      universal: true,
      implemented: special.implemented,
      presentation: {
        displayName: special.displayName,
        patternId: special.patternId,
      },
    });
  }
}

export function createProductionIconRegistry(): IconRegistry {
  const registry = createEmptyIconRegistry();
  registerUniversalSpecialIcons(registry);
  return registry;
}

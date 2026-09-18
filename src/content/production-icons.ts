import { createEmptyIconRegistry, type IconRegistry } from "../icons/index.js";
import { SPECIAL_ICON_CATALOG } from "../special-icons/index.js";
import { canonicalOrdinaryIcons } from "./canonical-icons.js";

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

export function registerCanonicalOrdinaryIcons(registry: IconRegistry): void {
  for (const icon of canonicalOrdinaryIcons()) {
    registry.register(icon);
  }
}

export function createProductionIconRegistry(): IconRegistry {
  const registry = createEmptyIconRegistry();
  registerUniversalSpecialIcons(registry);
  registerCanonicalOrdinaryIcons(registry);
  return registry;
}

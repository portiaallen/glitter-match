import { GLITTER_ICON_ID, type IconId } from "../ids.js";
import type { IconRegistry } from "../icons/index.js";

export function isGlitter(iconId: IconId): boolean {
  return iconId === GLITTER_ICON_ID;
}

/**
 * Compatibility is identity-based plus the single universal exception:
 * the Glitter Icon may pair with ordinary icons. No extra Glitter behavior.
 */
export function iconsCompatible(a: IconId, b: IconId, registry: IconRegistry): boolean {
  if (a === b) {
    return true;
  }
  if (isGlitter(a) || isGlitter(b)) {
    const other = isGlitter(a) ? b : a;
    const record = registry.get(other);
    return record.kind === "ordinary" || record.kind === "dev" || record.kind === "glitter";
  }
  return false;
}

export function groupColor(iconIds: IconId[], registry: IconRegistry): IconId | null {
  const ordinary = iconIds.find((id) => {
    const record = registry.get(id);
    return record.kind === "ordinary" || record.kind === "dev";
  });
  return ordinary ?? null;
}

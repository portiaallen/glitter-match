import { GLITTER_ICON_ID, LAND_IDS, type LandId } from "../ids.js";
import type { IconRegistry } from "../icons/index.js";
import type { LandRegistry } from "../lands/index.js";
import { SPECIAL_ICON_IDS } from "../special-icons/index.js";
import { issue, type ValidationIssue } from "../validation.js";
import { ORDINARY_ICONS_PER_LAND } from "./canonical-icons.js";

/**
 * ONE LAND. ONE ICON FAMILY. ZERO DUPLICATES.
 */
export function validateIconLaw(icons: IconRegistry, lands: LandRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  issues.push(...lands.validateIntegrity());
  issues.push(...icons.validateIntegrity());

  const ordinary = icons.list().filter((icon) => icon.kind === "ordinary");
  const seenIds = new Set<string>();
  const seenNames = new Map<string, string>();

  for (const icon of ordinary) {
    if (seenIds.has(icon.id)) {
      issues.push(issue("canon.duplicate_ordinary", `icons.${icon.id}`, `Duplicate ordinary icon "${icon.id}".`));
    }
    seenIds.add(icon.id);
    if (!lands.has(icon.landId)) {
      issues.push(issue("canon.unauthorized_land", `icons.${icon.id}`, `Ordinary icon "${icon.id}" uses unauthorized Land "${icon.landId}".`));
    }
    const nameKey = icon.presentation.displayName.toLowerCase();
    const prior = seenNames.get(nameKey);
    if (prior && prior !== icon.landId) {
      issues.push(
        issue(
          "canon.duplicate_name",
          `icons.${icon.id}`,
          `Ordinary display name "${icon.presentation.displayName}" is used on more than one Land.`,
        ),
      );
    }
    seenNames.set(nameKey, icon.landId);
  }

  for (const landId of LAND_IDS) {
    const family = icons.ordinaryIconsFor(landId);
    if (family.length !== ORDINARY_ICONS_PER_LAND) {
      issues.push(
        issue(
          "canon.family_size",
          `lands.${landId}.icons`,
          `Land "${landId}" must have exactly ${ORDINARY_ICONS_PER_LAND} ordinary icons (found ${family.length}).`,
        ),
      );
    }
    for (const icon of family) {
      if (icon.landId !== landId) {
        issues.push(issue("canon.family_split", `icons.${icon.id}`, `Icon belongs to ${icon.landId} but is listed under ${landId}.`));
      }
    }
  }

  const glitter = icons.get(GLITTER_ICON_ID);
  if (glitter.kind !== "glitter" || glitter.landId !== null) {
    issues.push(issue("canon.glitter_land", "icons.glitter", "The Universal Glitter Icon belongs to no Land."));
  }

  for (const id of SPECIAL_ICON_IDS) {
    if (!icons.has(id)) {
      issues.push(issue("canon.special_missing", `icons.${id}`, `Universal Special Icon "${id}" is not registered.`));
      continue;
    }
    const special = icons.get(id);
    if (special.kind !== "special") {
      issues.push(issue("canon.special_kind", `icons.${id}`, `Special Icon "${id}" must remain kind "special".`));
    }
  }

  const extraLands = new Set<string>();
  for (const icon of ordinary) {
    extraLands.add(icon.landId);
  }
  for (const landId of extraLands) {
    if (!(LAND_IDS as readonly string[]).includes(landId)) {
      issues.push(issue("canon.ninth_land", "lands", `Unauthorized Land "${landId}" appeared in icon ownership.`));
    }
  }

  return issues;
}

export function landOwnsOrdinary(icons: IconRegistry, landId: LandId, iconId: string): boolean {
  if (!icons.has(iconId)) {
    return false;
  }
  const icon = icons.get(iconId);
  return icon.kind === "ordinary" && icon.landId === landId;
}

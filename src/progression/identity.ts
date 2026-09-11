import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import { levelRefKey, type LevelReference, type UniverseContent } from "./types.js";

export function parseLevelReference(ref: LevelReference): LevelReference {
  const issues: ValidationIssue[] = [];
  if (!ref.universeId) {
    issues.push(issue("progression.invalid_ref", "universeId", "universeId is required."));
  }
  if (!ref.landId) {
    issues.push(issue("progression.invalid_ref", "landId", "landId is required."));
  }
  if (!ref.packId) {
    issues.push(issue("progression.invalid_ref", "packId", "packId is required."));
  }
  if (!ref.levelId) {
    issues.push(issue("progression.invalid_ref", "levelId", "levelId is required."));
  }
  throwIfErrors(issues, "Invalid level reference");
  return ref;
}

export function resolveLevelReference(universe: UniverseContent, ref: LevelReference): LevelReference {
  const parsed = parseLevelReference(ref);
  const issues: ValidationIssue[] = [];
  if (parsed.universeId !== universe.id) {
    issues.push(issue("progression.unknown_universe", "universeId", `Unknown universe "${parsed.universeId}".`));
  }
  if (!universe.landIds.includes(parsed.landId)) {
    issues.push(issue("progression.unknown_land", "landId", `Unknown land "${parsed.landId}".`));
  }
  const pack = universe.packs.find((item) => item.id === parsed.packId);
  if (!pack) {
    issues.push(issue("progression.unknown_pack", "packId", `Unknown pack "${parsed.packId}".`));
  } else if (!pack.nodeIds.includes(parsed.levelId)) {
    issues.push(issue("progression.unknown_level", "levelId", `Unknown level "${parsed.levelId}" in pack "${parsed.packId}".`));
  }
  throwIfErrors(issues, "Unknown level reference");
  return parsed;
}

export { levelRefKey };

import { DIFFICULTY_DIMENSIONS } from "../difficulty/model.js";
import { LAND_IDS } from "../ids.js";
import type { MechanicLookup } from "../mechanics/composition.js";
import { issue, type ValidationIssue } from "../validation.js";
import type { LandRegistry } from "./registry.js";
import type { MechanicalVerbRegistry } from "./verbs.js";

export function validateLandDna(
  lands: LandRegistry,
  verbs: MechanicalVerbRegistry,
  mechanics?: MechanicLookup,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  issues.push(...lands.validateIntegrity());

  for (const land of lands.list()) {
    const path = `lands.${land.id}`;
    if (land.slug !== land.id) {
      issues.push(issue("land.slug_mismatch", `${path}.slug`, `Land slug "${land.slug}" must match id "${land.id}".`));
    }
    if (!land.name) {
      issues.push(issue("land.name_missing", `${path}.name`, `Land "${land.id}" must declare a name.`));
    }
    if (!land.philosophicalQuestion) {
      issues.push(issue("land.question_missing", `${path}.philosophicalQuestion`, `Land "${land.id}" must declare its question.`));
    }
    if (!land.coreTheme || !land.designPrinciple) {
      issues.push(issue("land.identity_missing", path, `Land "${land.id}" must declare coreTheme and designPrinciple.`));
    }
    if (land.mechanicalLanguage.length === 0) {
      issues.push(issue("land.language_missing", `${path}.mechanicalLanguage`, `Land "${land.id}" must declare mechanical language.`));
    }
    for (const verb of land.mechanicalVerbs) {
      if (!verbs.has(verb)) {
        issues.push(issue("land.unknown_verb", `${path}.mechanicalVerbs`, `Land "${land.id}" references unknown verb "${verb}".`));
      }
    }
    for (const field of [
      "boardLanguage",
      "movementLanguage",
      "matchLanguage",
      "obstacleLanguage",
      "objectiveLanguage",
      "visualLanguage",
      "audioLanguage",
    ] as const) {
      if (!land[field]) {
        issues.push(issue("land.vocabulary_missing", `${path}.${field}`, `Land "${land.id}" must declare ${field}.`));
      }
    }
    for (const [axis, value] of Object.entries(land.difficultyBias)) {
      if (!(DIFFICULTY_DIMENSIONS as readonly string[]).includes(axis)) {
        issues.push(issue("land.difficulty_axis", `${path}.difficultyBias`, `Unknown difficulty axis "${axis}".`));
      } else if (typeof value === "number" && (value < 0 || value > 10)) {
        issues.push(issue("land.difficulty_range", `${path}.difficultyBias.${axis}`, `"${axis}" must be 0–10.`));
      }
    }
    const a11y = land.accessibilityConsiderations;
    for (const key of [
      "reducedMotion",
      "nonColorOnly",
      "textState",
      "audioCues",
      "hapticCues",
      "timingAccommodations",
      "stateChangeIndication",
    ] as const) {
      if (!a11y[key]) {
        issues.push(issue("land.a11y_missing", `${path}.accessibilityConsiderations.${key}`, `Land "${land.id}" is missing ${key}.`));
      }
    }
    if (land.finale.levelRef !== null) {
      issues.push(
        issue(
          "land.finale_authored",
          `${path}.finale.levelRef`,
          "Finale level references must stay unresolved while campaign authoring is locked. Do not create Level 80.",
        ),
      );
    }
    if (mechanics) {
      for (const mechanicId of land.mechanicRegistry) {
        if (!mechanics.has(mechanicId)) {
          issues.push(issue("land.unknown_mechanic", `${path}.mechanicRegistry`, `Land "${land.id}" references unknown mechanic "${mechanicId}".`));
          continue;
        }
        const mechanic = mechanics.get(mechanicId);
        if (mechanic.landId && mechanic.landId !== land.id && !mechanic.crossLand) {
          issues.push(
            issue(
              "land.mechanic_wrong_land",
              `${path}.mechanicRegistry`,
              `Mechanic "${mechanicId}" is registered for ${mechanic.landId}, not ${land.id}.`,
            ),
          );
        }
      }
    }
  }

  if (lands.list().length !== LAND_IDS.length) {
    issues.push(issue("land.count", "lands", `Expected exactly ${LAND_IDS.length} Lands.`));
  }
  return issues;
}

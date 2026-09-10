import { DIFFICULTY_DIMENSIONS } from "../difficulty/model.js";
import { SPECIAL_ICON_IDS } from "../special-icons/index.js";
import { GLITTER_ICON_ID } from "../ids.js";
import { issue, type ValidationIssue } from "../validation.js";
import { MECHANIC_EFFECT_KINDS, MECHANIC_INVARIANTS, MECHANIC_LIFECYCLE, type MechanicHandler } from "./contract.js";
import { parseSemver } from "../content/versions.js";

export function validateMechanicContract(mechanic: MechanicHandler): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `mechanics.${mechanic.id}`;

  if (!mechanic.id) {
    issues.push(issue("mechanic.id_missing", path, "Mechanic id is required."));
  }
  if (SPECIAL_ICON_IDS.includes(mechanic.id as (typeof SPECIAL_ICON_IDS)[number])) {
    issues.push(
      issue(
        "mechanic.special_icon_id",
        path,
        `Mechanic id "${mechanic.id}" collides with a Universal Special Icon. Land mechanics must not redefine them.`,
      ),
    );
  }
  if (mechanic.id === GLITTER_ICON_ID) {
    issues.push(issue("mechanic.glitter_id", path, "A mechanic cannot take the Glitter Icon id."));
  }
  if (!mechanic.version || !parseSemver(mechanic.version)) {
    issues.push(issue("mechanic.version_invalid", `${path}.version`, `Mechanic "${mechanic.id}" needs a semver version.`));
  }
  if (mechanic.status === "implemented" && !mechanic.implemented) {
    issues.push(issue("mechanic.status_mismatch", path, `Mechanic "${mechanic.id}" is marked implemented but implemented=false.`));
  }
  if (mechanic.status === "reserved" && mechanic.implemented) {
    issues.push(issue("mechanic.reserved_implemented", path, `Reserved mechanic "${mechanic.id}" must stay implemented: false.`));
  }
  for (const phase of mechanic.lifecycle) {
    if (!(MECHANIC_LIFECYCLE as readonly string[]).includes(phase)) {
      issues.push(issue("mechanic.unknown_lifecycle", `${path}.lifecycle`, `Unknown lifecycle phase "${phase}".`));
    }
  }
  if (mechanic.hooks) {
    for (const phase of Object.keys(mechanic.hooks)) {
      if (!mechanic.lifecycle.includes(phase as (typeof MECHANIC_LIFECYCLE)[number])) {
        issues.push(
          issue(
            "mechanic.undeclared_hook",
            `${path}.hooks.${phase}`,
            `Hook "${phase}" is implemented but not declared on lifecycle.`,
          ),
        );
      }
    }
  }
  if (mechanic.deterministic.required !== true || mechanic.deterministic.hiddenRandomness !== false) {
    issues.push(
      issue(
        "mechanic.not_deterministic",
        `${path}.deterministic`,
        `Mechanic "${mechanic.id}" must declare deterministic behavior and forbid hidden randomness.`,
      ),
    );
  }
  if (mechanic.authority !== "graph") {
    issues.push(issue("mechanic.xy_authority", path, `Mechanic "${mechanic.id}" must use graph authority, never x/y.`));
  }
  if (!mechanic.accessibility.nonColorIndicator) {
    issues.push(issue("mechanic.a11y_color_only", `${path}.accessibility`, "Non-color indicator is required."));
  }
  if (!mechanic.accessibility.textState) {
    issues.push(issue("mechanic.a11y_text", `${path}.accessibility`, "Accessible text/state description is required."));
  }
  for (const dimension of mechanic.difficultyInfluence) {
    if (!(DIFFICULTY_DIMENSIONS as readonly string[]).includes(dimension)) {
      issues.push(issue("mechanic.difficulty_axis", `${path}.difficultyInfluence`, `Unknown difficulty axis "${dimension}".`));
    }
  }
  for (const invariant of mechanic.invariants) {
    if (!(MECHANIC_INVARIANTS as readonly string[]).includes(invariant)) {
      issues.push(issue("mechanic.unknown_invariant", `${path}.invariants`, `Unknown invariant "${invariant}".`));
    }
  }
  if (mechanic.specialIconPolicy !== "universal-unchanged") {
    issues.push(issue("mechanic.special_icon_redefine", path, "Special Icons remain universal."));
  }
  if (mechanic.glitterPolicy !== "landless-unchanged") {
    issues.push(issue("mechanic.glitter_reassign", path, "The Glitter Icon remains landless."));
  }
  return issues;
}

export function validateEffectKind(kind: string, path: string): ValidationIssue[] {
  if (!(MECHANIC_EFFECT_KINDS as readonly string[]).includes(kind)) {
    return [issue("mechanic.unknown_effect", path, `Unknown mechanic effect kind "${kind}".`)];
  }
  return [];
}

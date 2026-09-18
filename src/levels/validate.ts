import type { BoardDefinition } from "../board/types.js";
import { validateBoardDefinition } from "../board/validate.js";
import { validateIconLaw } from "../content/icon-law.js";
import { SCHEMA_VERSION, versionsCompatible } from "../content/versions.js";
import { DIFFICULTY_DIMENSIONS, vectorFromRating } from "../difficulty/model.js";
import { validateReward } from "../economy/rewards.js";
import type { IconRegistry } from "../icons/index.js";
import type { LandRegistry } from "../lands/index.js";
import type { MatchRuleRegistry } from "../matching/contracts.js";
import { createMatchRuleRegistry } from "../matching/contracts.js";
import { validateLandDna, type MechanicalVerbRegistry } from "../lands/index.js";
import { normalizeMechanicBindings, validateMechanicComposition, type MechanicRegistry } from "../mechanics/index.js";
import { OBJECTIVE_TYPES, type ObjectiveDefinition } from "../objectives/index.js";
import { createObjectiveRegistry, type ObjectiveRegistry } from "../objectives/registry.js";
import type { ObstacleRegistry } from "../obstacles/index.js";
import { isSpecialIconId } from "../special-icons/index.js";
import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import { LEVEL_DNA_REQUIRED_FOR_PRODUCTION, parseLevelJson, type LevelDefinition } from "./schema.js";

export type ValidationProfile = "development" | "production";

export interface LevelValidationContext {
  icons: IconRegistry;
  lands: LandRegistry;
  obstacles: ObstacleRegistry;
  mechanics: MechanicRegistry;
  matchContracts?: MatchRuleRegistry;
  objectives?: ObjectiveRegistry;
  verbs?: MechanicalVerbRegistry;
  profile?: ValidationProfile;
  sourcePath?: string;
}

export function loadAndValidateLevel(input: unknown, ctx: LevelValidationContext): LevelDefinition {
  const parsed = parseLevelJson(input);
  const issues = validateLevel(parsed, ctx);
  throwIfErrors(issues, `Level "${parsed.id}" is invalid`);
  return parsed;
}

export function validateLevel(level: LevelDefinition, ctx: LevelValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const profile = ctx.profile ?? level.status;
  const matchContracts = ctx.matchContracts ?? createMatchRuleRegistry();
  const objectives = ctx.objectives ?? createObjectiveRegistry();

  if (!ctx.lands.has(level.land)) {
    issues.push(issue("level.unknown_land", "land", `Unknown land "${level.land}".`));
  }

  if (profile === "production" && level.status !== "production") {
    issues.push(
      issue("level.dev_in_production", "status", "Development levels cannot be loaded under the production profile."),
    );
  }

  issues.push(...validateDevFixturePolicy(level, profile, ctx.sourcePath));
  issues.push(...validateBoardDefinition(toBoardDefinition(level)).map((item) => ({
    ...item,
    path: item.path.startsWith("board.") ? item.path : `board.${item.path}`,
  })));
  issues.push(...validateIcons(level, ctx, profile));
  issues.push(...validateObjective(level.objective, "objective", level, objectives));
  for (const [index, extra] of (level.objectives ?? []).entries()) {
    issues.push(...validateObjective(extra, `objectives[${index}]`, level, objectives));
  }
  issues.push(...validateObstacles(level, ctx));
  if (ctx.verbs) {
    issues.push(...validateLandDna(ctx.lands, ctx.verbs, ctx.mechanics));
  }
  issues.push(...validateMechanics(level, ctx));
  issues.push(...validateRewards(level));
  issues.push(...validateMatchContracts(level, matchContracts));
  issues.push(...validateMovementModel(level));
  issues.push(...validateDifficulty(level, profile));
  issues.push(...validateRuleOfThree(level, profile));
  issues.push(...validateSecrets(level));
  issues.push(...validateAccessibility(level, profile));
  issues.push(...validateVersions(level, profile));
  issues.push(...validateMasterySeparation(level));

  if (profile === "production") {
    issues.push(...validateIconLaw(ctx.icons, ctx.lands));
    for (const field of LEVEL_DNA_REQUIRED_FOR_PRODUCTION) {
      if (level[field] === undefined) {
        issues.push(
          issue(
            "dna.missing_field",
            field,
            `Production Level DNA requires "${field}". 640 campaign levels are future content; this is the contract, not a generated level.`,
          ),
        );
      }
    }
  }

  return issues;
}

export function toBoardDefinition(level: LevelDefinition): BoardDefinition {
  return {
    topology: level.board.topology,
    cells: level.board.cells,
    adjacency: level.board.adjacency,
    flow: level.board.flow,
    portals: level.board.portals,
    sections: level.board.sections,
    movement: level.board.movement ?? level.movementRules,
    portalsConductMatches: level.board.portalsConductMatches,
    portalsAllowSwap: level.board.portalsAllowSwap,
  };
}

export function isLaboratoryFixtureId(id: string): boolean {
  return id.startsWith("lab.") || id.startsWith("lab/");
}

function validateDevFixturePolicy(
  level: LevelDefinition,
  profile: ValidationProfile,
  sourcePath?: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fromLabPath = Boolean(sourcePath && /(?:^|\/)data\/lab\//.test(sourcePath.replaceAll("\\", "/")));
  if (profile === "production" && (isLaboratoryFixtureId(level.id) || fromLabPath || level.purpose === "engine-fixture")) {
    issues.push(
      issue(
        "content.lab_as_production",
        "purpose",
        "Board Laboratory fixtures (data/lab/*) are engine tests only and cannot become production levels.",
      ),
    );
  }
  if (level.purpose === "campaign") {
    issues.push(
      issue(
        "content.campaign_forbidden",
        "purpose",
        "Campaign / 640-level content is not authored in this architecture phase.",
      ),
    );
  }
  return issues;
}

function validateIcons(
  level: LevelDefinition,
  ctx: LevelValidationContext,
  profile: ValidationProfile,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const referenced = new Set<string>(level.iconPool);
  for (const cell of level.board.cells) {
    if (cell.initialIcon) {
      referenced.add(cell.initialIcon);
    }
  }

  for (const iconId of referenced) {
    if (!ctx.icons.has(iconId)) {
      issues.push(issue("level.unknown_icon", "iconPool", `Unknown icon "${iconId}".`));
      continue;
    }
    const icon = ctx.icons.get(iconId);
    if (icon.kind === "dev" && profile === "production") {
      issues.push(
        issue("level.dev_icon", `icons.${iconId}`, `Development icon "${iconId}" is not legal in production content.`),
      );
    }
    if (icon.kind === "ordinary" && icon.landId !== level.land) {
      issues.push(
        issue(
          "level.icon_land_mismatch",
          `icons.${iconId}`,
          `Ordinary icon "${iconId}" belongs to ${icon.landId}, not ${level.land}. ONE LAND. ONE ICON FAMILY.`,
        ),
      );
    }
    if (icon.kind === "special") {
      issues.push(
        issue(
          "level.special_in_pool",
          `icons.${iconId}`,
          "Special Icons are inventory items, not board match icons. Do not place them in the icon pool.",
        ),
      );
    }
    if (icon.kind === "glitter" && icon.landId !== null) {
      issues.push(issue("level.glitter_has_land", `icons.${iconId}`, "The Glitter Icon belongs to no Land."));
    }
  }

  if (profile === "production") {
    const ordinary = [...referenced]
      .filter((id) => ctx.icons.has(id))
      .map((id) => ctx.icons.get(id))
      .filter((icon) => icon.kind === "ordinary");
    if (ordinary.length === 0) {
      issues.push(issue("level.no_ordinary_icons", "iconPool", "Production levels need at least one ordinary land icon."));
    }
  }

  return issues;
}

function validateObjective(
  objective: ObjectiveDefinition,
  path: string,
  level: LevelDefinition,
  registry: ObjectiveRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!OBJECTIVE_TYPES.includes(objective.type)) {
    issues.push(issue("objective.unknown_type", `${path}.type`, `Unknown objective type "${objective.type}".`));
  } else if (!registry.has(objective.type)) {
    issues.push(issue("objective.unregistered", `${path}.type`, `Objective type "${objective.type}" is not registered.`));
  }
  const cellIds = new Set(level.board.cells.map((cell) => cell.id));

  const requireCells = (ids: string[] | undefined, field: string) => {
    for (const id of ids ?? []) {
      if (!cellIds.has(id)) {
        issues.push(issue("objective.unknown_cell", `${path}.${field}`, `Objective references unknown cell "${id}".`));
      }
    }
  };

  switch (objective.type) {
    case "collection":
      if (!objective.iconId || !objective.count) {
        issues.push(issue("objective.collection_fields", path, "collection objectives require iconId and count."));
      }
      break;
    case "clearing":
    case "discovery":
      if (!objective.cellIds?.length) {
        issues.push(issue("objective.cells_required", path, `${objective.type} objectives require cellIds.`));
      }
      requireCells(objective.cellIds, "cellIds");
      break;
    case "path":
      if (!objective.startCellId || !objective.endCellId) {
        issues.push(issue("objective.path_fields", path, "path objectives require startCellId and endCellId."));
      }
      requireCells([objective.startCellId, objective.endCellId].filter(Boolean) as string[], "cells");
      break;
    case "score":
      if (objective.score === undefined) {
        issues.push(issue("objective.score_field", path, "score objectives require score."));
      }
      break;
    case "combo":
      if (!objective.combo) {
        issues.push(issue("objective.combo_field", path, "combo objectives require combo."));
      }
      break;
    case "precision":
      if (objective.moves === undefined) {
        issues.push(issue("objective.precision_field", path, "precision objectives require moves."));
      }
      break;
    case "survival":
      if (!objective.cascades) {
        issues.push(issue("objective.survival_field", path, "survival objectives require cascades."));
      }
      break;
    case "pattern":
      if (!objective.iconByCell || Object.keys(objective.iconByCell).length === 0) {
        issues.push(issue("objective.pattern_field", path, "pattern objectives require iconByCell."));
      }
      requireCells(Object.keys(objective.iconByCell ?? {}), "iconByCell");
      break;
    case "multi-stage":
      if (!objective.stages?.length) {
        issues.push(issue("objective.stages_field", path, "multi-stage objectives require stages."));
      }
      for (const [index, stage] of (objective.stages ?? []).entries()) {
        issues.push(...validateObjective(stage, `${path}.stages[${index}]`, level, registry));
      }
      break;
    case "hybrid":
      if (!objective.children?.length) {
        issues.push(issue("objective.children_field", path, "hybrid objectives require children."));
      }
      for (const [index, child] of (objective.children ?? []).entries()) {
        issues.push(...validateObjective(child, `${path}.children[${index}]`, level, registry));
      }
      break;
    default:
      break;
  }
  return issues;
}

function validateObstacles(level: LevelDefinition, ctx: LevelValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const placements = [
    ...(level.obstacles ?? []),
    ...level.board.cells.flatMap((cell) => cell.initialObstacles ?? []),
  ];
  for (const [index, placement] of placements.entries()) {
    if (!ctx.obstacles.has(placement.type)) {
      issues.push(
        issue("obstacle.unknown", `obstacles[${index}]`, `Unknown obstacle type "${placement.type}".`),
      );
      continue;
    }
    const handler = ctx.obstacles.get(placement.type);
    if (!handler.implemented) {
      issues.push(
        issue(
          "obstacle.unimplemented",
          `obstacles[${index}]`,
          `Obstacle "${placement.type}" is reserved but not implemented. Levels must not reference it yet.`,
        ),
      );
    }
  }
  return issues;
}

function validateMechanics(level: LevelDefinition, ctx: LevelValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bindings = normalizeMechanicBindings(level.mechanics);
  issues.push(...validateMechanicComposition(bindings, ctx.mechanics, level.land));
  for (const [index, binding] of bindings.entries()) {
    if (!ctx.mechanics.has(binding.id)) {
      continue;
    }
    const mechanic = ctx.mechanics.get(binding.id);
    if (!mechanic.implemented) {
      issues.push(
        issue("mechanic.unimplemented", `mechanics[${index}]`, `Mechanic "${binding.id}" is not implemented.`),
      );
    }
  }
  return issues;
}

function validateRewards(level: LevelDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [index, reward] of (level.rewards ?? []).entries()) {
    const message = validateReward(reward, `rewards[${index}]`);
    if (message) {
      issues.push(issue("reward.invalid", `rewards[${index}]`, message));
    }
    if (reward.kind === "special-icon" && reward.id && !isSpecialIconId(reward.id)) {
      issues.push(issue("reward.unknown_special", `rewards[${index}]`, `Unknown special icon reward "${reward.id}".`));
    }
  }
  return issues;
}

function validateMatchContracts(level: LevelDefinition, registry: MatchRuleRegistry): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [index, id] of (level.matchRules.contracts ?? []).entries()) {
    if (!registry.has(id)) {
      issues.push(issue("match.unknown_contract", `matchRules.contracts[${index}]`, `Unknown match contract "${id}".`));
      continue;
    }
    const contract = registry.get(id);
    if (!contract.implemented) {
      issues.push(
        issue(
          "match.unimplemented_contract",
          `matchRules.contracts[${index}]`,
          `Match contract "${id}" is reserved. Do not implement Land-specific match logic in the engine core.`,
        ),
      );
    }
  }
  return issues;
}

function validateMovementModel(level: LevelDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const model = level.movementModel;
  if (!model) {
    return issues;
  }
  if (model.traversal && model.traversal !== "graph") {
    issues.push(
      issue("movement.not_graph", "movementModel.traversal", "Movement must operate on the authored graph. Never infer movement from x/y."),
    );
  }
  return issues;
}

function validateDifficulty(level: LevelDefinition, profile: ValidationProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!level.difficulty) {
    return issues;
  }
  const vector = vectorFromRating({ authored: {}, ...level.difficulty });
  for (const dimension of DIFFICULTY_DIMENSIONS) {
    const value = vector[dimension];
    if (value === undefined) {
      if (profile === "production") {
        issues.push(
          issue(
            "difficulty.missing_dimension",
            `difficulty.${dimension}`,
            `Production difficulty must author "${dimension}" on the 0–10 scale. Difficulty is multidimensional, not easy/medium/hard.`,
          ),
        );
      }
      continue;
    }
    if (value < 0 || value > 10) {
      issues.push(issue("difficulty.out_of_range", `difficulty.${dimension}`, `"${dimension}" must be between 0 and 10.`));
    }
  }
  return issues;
}

function validateRuleOfThree(level: LevelDefinition, profile: ValidationProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (profile === "production" && !level.ruleOfThree) {
    issues.push(
      issue("rule_of_three.missing", "ruleOfThree", "Production Level DNA requires Familiar + New + Surprising metadata."),
    );
  }
  if (level.ruleOfThree) {
    if (level.ruleOfThree.familiar.length < 1 || level.ruleOfThree.new.length < 1 || level.ruleOfThree.surprising.length < 1) {
      issues.push(issue("rule_of_three.incomplete", "ruleOfThree", "Rule of Three requires familiar, new, and surprising entries."));
    }
  }
  return issues;
}

function validateSecrets(level: LevelDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const secret = level.secret;
  if (secret?.requiredForCompletion) {
    const hasDiscoveryObjective =
      level.objective.type === "discovery" ||
      (level.objectives ?? []).some((item) => item.type === "discovery");
    if (!hasDiscoveryObjective) {
      issues.push(
        issue(
          "secret.required_without_objective",
          "secret.requiredForCompletion",
          "A secret must never be required to complete the core level unless it is also authored as an objective.",
        ),
      );
    }
  }
  for (const [index, discovery] of (level.discoveries ?? []).entries()) {
    if (discovery.requiredForCompletion && discovery.kind !== "discovery-moment") {
      issues.push(
        issue(
          "discovery.required",
          `discoveries[${index}]`,
          "Optional discoveries cannot be required unless authored as a discovery objective.",
        ),
      );
    }
  }
  return issues;
}

function validateAccessibility(level: LevelDefinition, profile: ValidationProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const access = level.accessibility;
  if (profile === "production" && !access) {
    issues.push(issue("a11y.missing", "accessibility", "Production Level DNA requires accessibility metadata."));
    return issues;
  }
  if (!access) {
    return issues;
  }
  if (!access.nonColorOnly) {
    issues.push(
      issue(
        "a11y.color_only",
        "accessibility.nonColorOnly",
        "Gameplay-critical information must never rely solely on color.",
      ),
    );
  }
  if (access.largeTouchTargets && access.minHitTargetPx !== undefined && access.minHitTargetPx < 44) {
    issues.push(
      issue("a11y.hit_target", "accessibility.minHitTargetPx", "largeTouchTargets requires minHitTargetPx of at least 44."),
    );
  }
  return issues;
}

function validateVersions(level: LevelDefinition, profile: ValidationProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (level.schemaVersion && !versionsCompatible(level.schemaVersion, SCHEMA_VERSION) && profile === "production") {
    issues.push(
      issue(
        "version.incompatible",
        "schemaVersion",
        `Schema version "${level.schemaVersion}" is not compatible with "${SCHEMA_VERSION}".`,
      ),
    );
  }
  return issues;
}

function validateMasterySeparation(level: LevelDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (level.mastery && level.objective.type === "precision" && level.mastery.maxMovesUsed && level.objective.moves !== undefined) {
    if (level.mastery.maxMovesUsed >= level.objective.moves) {
      issues.push(
        issue(
          "mastery.not_stricter",
          "mastery.maxMovesUsed",
          "Mastery must be stricter than completion. Completion ≠ Mastery.",
        ),
      );
    }
  }
  return issues;
}

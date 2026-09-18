import type { BoardDefinition } from "../board/types.js";
import { validateBoardDefinition } from "../board/validate.js";
import { validateReward } from "../economy/rewards.js";
import type { IconRegistry } from "../icons/index.js";
import type { LandRegistry } from "../lands/index.js";
import type { MechanicRegistry } from "../mechanics/index.js";
import { OBJECTIVE_TYPES, type ObjectiveDefinition } from "../objectives/index.js";
import type { ObstacleRegistry } from "../obstacles/index.js";
import { isSpecialIconId } from "../special-icons/index.js";
import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import { parseLevelJson, type LevelDefinition } from "./schema.js";

export type ValidationProfile = "development" | "production";

export interface LevelValidationContext {
  icons: IconRegistry;
  lands: LandRegistry;
  obstacles: ObstacleRegistry;
  mechanics: MechanicRegistry;
  profile?: ValidationProfile;
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

  if (!ctx.lands.has(level.land)) {
    issues.push(issue("level.unknown_land", "land", `Unknown land "${level.land}".`));
  }

  if (profile === "production" && level.status !== "production") {
    issues.push(
      issue("level.dev_in_production", "status", "Development levels cannot be loaded under the production profile."),
    );
  }

  issues.push(...validateBoardDefinition(toBoardDefinition(level)).map((item) => ({
    ...item,
    path: item.path.startsWith("board.") ? item.path : `board.${item.path}`,
  })));
  issues.push(...validateIcons(level, ctx, profile));
  issues.push(...validateObjective(level.objective, "objective", level));
  issues.push(...validateObstacles(level, ctx));
  issues.push(...validateMechanics(level, ctx));
  issues.push(...validateRewards(level));

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

function validateObjective(objective: ObjectiveDefinition, path: string, level: LevelDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!OBJECTIVE_TYPES.includes(objective.type)) {
    issues.push(issue("objective.unknown_type", `${path}.type`, `Unknown objective type "${objective.type}".`));
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
        issues.push(...validateObjective(stage, `${path}.stages[${index}]`, level));
      }
      break;
    case "hybrid":
      if (!objective.children?.length) {
        issues.push(issue("objective.children_field", path, "hybrid objectives require children."));
      }
      for (const [index, child] of (objective.children ?? []).entries()) {
        issues.push(...validateObjective(child, `${path}.children[${index}]`, level));
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
  for (const [index, id] of (level.mechanics ?? []).entries()) {
    if (!ctx.mechanics.has(id)) {
      issues.push(issue("mechanic.unknown", `mechanics[${index}]`, `Unknown mechanic "${id}".`));
      continue;
    }
    if (!ctx.mechanics.get(id).implemented) {
      issues.push(
        issue("mechanic.unimplemented", `mechanics[${index}]`, `Mechanic "${id}" is not implemented.`),
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

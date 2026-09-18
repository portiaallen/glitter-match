import { createPrimitiveRuntime, findPath } from "../primitives/index.js";
import { createPatternRegistry } from "../matching/index.js";
import type { ObjectiveDefinition, ObjectiveEvaluationContext } from "./model.js";
import { requiredField } from "./model.js";
import type { HandlerResult, ObjectiveStatus } from "./types.js";

function result(current: number, target: number, label: string, failed = false, extra: Partial<HandlerResult> = {}): HandlerResult {
  const status: ObjectiveStatus = failed ? "FAILED" : current >= target ? "COMPLETE" : "INCOMPLETE";
  return {
    current,
    target,
    status,
    label,
    reason: failed ? `${label} failed.` : status === "COMPLETE" ? `${label} reached ${current}/${target}.` : `${label} is ${current}/${target}.`,
    ...extra,
  };
}

/** countUnit: icon (or declared targetKind). Current comes from authoritative collectedIcons. Cascades/specials/player matches are included unless a later stats filter is registered; maxCount caps the displayed amount. */
export function evaluateCollection(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  const iconId = requiredField(definition.iconId, "collection.iconId");
  const target = requiredField(definition.count, "collection.count");
  let current = ctx.stats.collectedIcons[iconId] ?? 0;
  if (definition.maxCount !== undefined) {
    current = Math.min(current, definition.maxCount);
  }
  return result(current, target, definition.accessibilityLabel ?? `Collect ${target} ${iconId}`);
}

/** countUnit: cell. Unique target cells with a recorded clear count. Does not mean “clear the whole board.” */
export function evaluateClearing(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  const cellIds = requiredField(definition.cellIds, "clearing.cellIds");
  const current = cellIds.filter((id) => (ctx.stats.clearedCellCounts[id] ?? 0) > 0).length;
  return result(current, cellIds.length, definition.accessibilityLabel ?? "Clear marked cells");
}

export function evaluatePath(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  const start = requiredField(definition.startCellId, "path.startCellId");
  const end = requiredField(definition.endCellId, "path.endCellId");
  const label = definition.accessibilityLabel ?? `Open path ${start} → ${end}`;
  if (definition.pathMode === "graph" && ctx.board) {
    const runtime = createPrimitiveRuntime(ctx.board);
    const path = findPath(runtime, start, end);
    const longEnough = !definition.minPathLength || path.cellIds.length >= definition.minPathLength;
    return result(path.blocked || !longEnough ? 0 : 1, 1, label);
  }
  const cleared = (id: string) => (ctx.stats.clearedCellCounts[id] ?? 0) > 0;
  const current = Number(cleared(start)) + Number(cleared(end));
  return result(current, 2, label);
}

export function evaluateScore(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  const target = requiredField(definition.score, "score.score");
  return result(ctx.stats.score, target, definition.accessibilityLabel ?? `Score ${target}`);
}

/** countUnit: event. Default uses stats.maxCombo. comboEvents counts explicit registered kinds only — cascades are not combos unless REGISTERED_COMBO (combo ≥ 2) is listed. */
export function evaluateCombo(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  const target = requiredField(definition.combo, "combo.combo");
  const events = definition.comboEvents ?? [];
  if (events.length > 0 && ctx.events) {
    const current = ctx.events.filter((event) => events.includes(event.kind)).length;
    return result(current, target, definition.accessibilityLabel ?? `Perform ${target} combo events`);
  }
  return result(ctx.stats.maxCombo, target, definition.accessibilityLabel ?? `Reach combo ${target}`);
}

export function evaluatePrecision(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  const remainingNeeded = requiredField(definition.moves, "precision.moves");
  const remaining = ctx.movesRemaining ?? 0;
  const complete = ctx.stats.score > 0 && remaining >= remainingNeeded;
  return {
    current: remaining,
    target: remainingNeeded,
    status: complete ? "COMPLETE" : "INCOMPLETE",
    label: definition.accessibilityLabel ?? `Win with ≥ ${remainingNeeded} moves remaining`,
    reason: complete
      ? "Precision condition met."
      : ctx.stats.score > 0
        ? `Need ${remainingNeeded} moves remaining; have ${remaining}.`
        : "Precision requires a completed score source first.",
  };
}

export function evaluateSurvival(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  const target = requiredField(definition.cascades, "survival.cascades");
  const forbidden = definition.forbiddenEvents ?? [];
  const failed = Boolean(ctx.events?.some((event) => forbidden.includes(event.kind)));
  if (definition.surviveMoves !== undefined && ctx.stats.movesUsed > definition.surviveMoves) {
    return result(ctx.stats.movesUsed, definition.surviveMoves, definition.accessibilityLabel ?? `Survive ${definition.surviveMoves} moves`, true);
  }
  return result(ctx.stats.cascadesCompleted, target, definition.accessibilityLabel ?? `Survive ${target} cascades`, failed);
}

export function evaluatePattern(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  if (definition.patternId) {
    const patterns = createPatternRegistry();
    if (!patterns.has(definition.patternId)) {
      throw new Error(`Unknown pattern "${definition.patternId}".`);
    }
    const region = definition.cellIds ?? Object.keys(definition.iconByCell ?? {});
    const label = definition.accessibilityLabel ?? `Form registered pattern ${definition.patternId}`;
    if (definition.iconByCell) {
      const entries = Object.entries(definition.iconByCell);
      const current = entries.filter(([cellId, iconId]) => ctx.occupiedIcons[cellId] === iconId).length;
      return result(current, entries.length, label);
    }
    const current = region.filter((id) => ctx.occupiedIcons[id]).length;
    return result(current, Math.max(region.length, 1), label);
  }
  const iconByCell = requiredField(definition.iconByCell, "pattern.iconByCell");
  const entries = Object.entries(iconByCell);
  const current = entries.filter(([cellId, iconId]) => ctx.occupiedIcons[cellId] === iconId).length;
  return result(current, entries.length, definition.accessibilityLabel ?? "Form the authored pattern");
}

export function evaluateDiscovery(definition: ObjectiveDefinition, ctx: ObjectiveEvaluationContext): HandlerResult {
  const cellIds = requiredField(definition.cellIds, "discovery.cellIds");
  const revealed = new Set(ctx.stats.revealedCellIds);
  const discovered = ctx.events?.filter((event) => event.kind === "DISCOVERY_OCCURRED").length ?? 0;
  const current = Math.max(
    cellIds.filter((id) => revealed.has(id) || !ctx.hiddenCellIds.includes(id)).length,
    discovered > 0 && cellIds.length === 0 ? discovered : 0,
  );
  return result(current, cellIds.length || Math.max(discovered, 1), definition.accessibilityLabel ?? "Reveal hidden cells");
}

export function evaluateMultiStage(
  definition: ObjectiveDefinition,
  ctx: ObjectiveEvaluationContext,
  evaluateChild: (child: ObjectiveDefinition, ctx: ObjectiveEvaluationContext) => HandlerResult,
): HandlerResult {
  const stages = requiredField(definition.stages, "multi-stage.stages");
  let completed = 0;
  let active = stages[0]?.id;
  for (const stage of stages) {
    const child = evaluateChild(stage, ctx);
    if (child.status !== "COMPLETE") {
      active = stage.id;
      break;
    }
    completed += 1;
    active = stages[completed]?.id ?? stage.id;
  }
  return result(completed, stages.length, definition.accessibilityLabel ?? "Complete stages in order", false, { activeStageId: active });
}

export function evaluateHybrid(
  definition: ObjectiveDefinition,
  ctx: ObjectiveEvaluationContext,
  evaluateChild: (child: ObjectiveDefinition, ctx: ObjectiveEvaluationContext) => HandlerResult,
): HandlerResult {
  const children = requiredField(definition.children, "hybrid.children");
  const results = children.map((child) => evaluateChild(child, ctx));
  const op = definition.composition ?? (definition.mode === "any" ? "or" : "and");
  if (op === "not") {
    const child = results[0];
    const complete = child?.status !== "COMPLETE";
    return result(complete ? 1 : 0, 1, definition.accessibilityLabel ?? "NOT child objective", child?.status === "FAILED");
  }
  if (op === "sequence") {
    let completed = 0;
    for (const child of results) {
      if (child.status !== "COMPLETE") {
        break;
      }
      completed += 1;
    }
    return result(completed, children.length, definition.accessibilityLabel ?? "Complete objectives in sequence");
  }
  const current = results.filter((item) => item.status === "COMPLETE").length;
  const failed = results.some((item) => item.status === "FAILED");
  if (op === "or") {
    return result(current >= 1 ? 1 : 0, 1, definition.accessibilityLabel ?? "Complete any objective", failed && current === 0);
  }
  return result(current, children.length, definition.accessibilityLabel ?? "Complete all objectives", failed);
}

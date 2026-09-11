import { COMPOSITION_OPS, type UnlockCondition } from "./types.js";
import type { PlayerProgression } from "./types.js";
import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";

export interface UnlockEvaluationContext {
  completed: ReadonlySet<string>;
  mastered: ReadonlySet<string>;
  packCompleted: ReadonlySet<string>;
  landCompleted: ReadonlySet<string>;
  eventKinds: ReadonlySet<string>;
}

type UnlockEvaluator = (condition: UnlockCondition, ctx: UnlockEvaluationContext, evaluateChild: UnlockEvaluator) => boolean;

const HANDLERS: Record<string, UnlockEvaluator> = {
  always: () => true,
  "level-completed": (condition, ctx) => Boolean(condition.levelId && ctx.completed.has(condition.levelId)),
  "level-mastered": (condition, ctx) => Boolean(condition.levelId && ctx.mastered.has(condition.levelId)),
  "pack-completed": (condition, ctx) => Boolean(condition.packId && ctx.packCompleted.has(condition.packId)),
  "land-completed": (condition, ctx) => Boolean(condition.landId && ctx.landCompleted.has(condition.landId)),
  event: (condition, ctx) => Boolean(condition.eventKind && ctx.eventKinds.has(condition.eventKind)),
  and: (condition, ctx, evaluateChild) => (condition.children ?? []).every((child) => evaluateChild(child, ctx, evaluateChild)),
  or: (condition, ctx, evaluateChild) => (condition.children ?? []).some((child) => evaluateChild(child, ctx, evaluateChild)),
  sequence: (condition, ctx, evaluateChild) => {
    for (const child of condition.children ?? []) {
      if (!evaluateChild(child, ctx, evaluateChild)) {
        return false;
      }
    }
    return (condition.children?.length ?? 0) > 0;
  },
  not: (condition, ctx, evaluateChild) => !evaluateChild(condition.children?.[0] ?? { op: "always" }, ctx, evaluateChild),
  count: (condition, ctx, evaluateChild) => {
    const threshold = condition.threshold ?? 0;
    const current = (condition.children ?? []).filter((child) => evaluateChild(child, ctx, evaluateChild)).length;
    return current >= threshold;
  },
};

export function evaluateUnlock(condition: UnlockCondition, ctx: UnlockEvaluationContext): boolean {
  const handler = HANDLERS[condition.op];
  if (!handler) {
    throwIfErrors(
      [issue("progression.unknown_unlock_op", "unlock.op", `Unknown unlock op "${condition.op}".`)],
      "Unknown unlock condition",
    );
    throw new Error("unreachable");
  }
  return handler(condition, ctx, evaluateUnlock);
}

export function validateUnlockCondition(condition: UnlockCondition, knownLevelIds: Set<string>, path = "unlock"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!HANDLERS[condition.op]) {
    issues.push(issue("progression.unknown_unlock_op", `${path}.op`, `Unknown unlock op "${condition.op}".`));
    return issues;
  }
  if (condition.op === "level-completed" || condition.op === "level-mastered") {
    if (!condition.levelId) {
      issues.push(issue("progression.invalid_unlock", `${path}.levelId`, `${condition.op} requires levelId.`));
    } else if (!knownLevelIds.has(condition.levelId)) {
      issues.push(issue("progression.missing_prerequisite", `${path}.levelId`, `Prerequisite level "${condition.levelId}" does not exist.`));
    }
  }
  if ((condition.op === "and" || condition.op === "or" || condition.op === "sequence") && (condition.children?.length ?? 0) < 2) {
    issues.push(issue("progression.malformed_unlock", path, `${condition.op.toUpperCase()} requires at least two children.`));
  }
  if (condition.op === "not" && (condition.children?.length ?? 0) !== 1) {
    issues.push(issue("progression.malformed_unlock", path, "NOT requires exactly one child."));
  }
  if (condition.op === "count") {
    if (condition.threshold === undefined || condition.threshold < 1) {
      issues.push(issue("progression.invalid_unlock", `${path}.threshold`, "COUNT/THRESHOLD requires a positive threshold."));
    }
    if ((condition.children?.length ?? 0) < 1) {
      issues.push(issue("progression.malformed_unlock", path, "COUNT requires at least one child."));
    }
  }
  if (condition.op === "not" && condition.children?.[0]?.op === "always") {
    issues.push(issue("progression.impossible_prerequisite", path, "NOT always is an impossible unlock condition."));
  }
  for (const [index, child] of (condition.children ?? []).entries()) {
    issues.push(...validateUnlockCondition(child, knownLevelIds, `${path}.children[${index}]`));
  }
  void COMPOSITION_OPS;
  return issues;
}

export function unlockContextFromPlayer(
  player: PlayerProgression,
  packCompleted: ReadonlySet<string>,
  landCompleted: ReadonlySet<string>,
): UnlockEvaluationContext {
  return {
    completed: new Set(player.completedLevelIds),
    mastered: new Set(
      Object.values(player.levels)
        .filter((state) => state.mastery.mastered)
        .map((state) => state.levelId),
    ),
    packCompleted,
    landCompleted,
    eventKinds: new Set(player.events.map((event) => event.kind)),
  };
}

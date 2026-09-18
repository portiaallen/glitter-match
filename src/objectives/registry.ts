import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import type { ObjectiveDefinition, ObjectiveEvaluationContext, ObjectiveType } from "./model.js";
import { OBJECTIVE_TYPES } from "./model.js";
import {
  evaluateClearing,
  evaluateCollection,
  evaluateCombo,
  evaluateDiscovery,
  evaluateHybrid,
  evaluateMultiStage,
  evaluatePath,
  evaluatePattern,
  evaluatePrecision,
  evaluateScore,
  evaluateSurvival,
} from "./handlers.js";
import type { CountUnit, HandlerResult, ObjectiveAccessibility } from "./types.js";
import { defaultObjectiveAccessibility } from "./types.js";

export interface ObjectiveTypeSpec {
  type: ObjectiveType;
  implemented: boolean;
  description: string;
  accessibilityHint: string;
  supportsFailure: boolean;
  supportsDependencies: boolean;
}

export interface ObjectiveHandler extends ObjectiveTypeSpec {
  version: string;
  category: ObjectiveType;
  countUnit: CountUnit;
  accessibility: ObjectiveAccessibility;
  debug: string;
  testHarness: true;
  evaluate: (
    definition: ObjectiveDefinition,
    ctx: ObjectiveEvaluationContext,
    evaluateChild: (child: ObjectiveDefinition, ctx: ObjectiveEvaluationContext) => HandlerResult,
  ) => HandlerResult;
}

function spec(
  type: ObjectiveType,
  description: string,
  countUnit: CountUnit,
  evaluate: ObjectiveHandler["evaluate"],
  supportsFailure = false,
): ObjectiveHandler {
  return {
    type,
    version: "9.0.0",
    category: type,
    implemented: true,
    description,
    accessibilityHint: `${type} progress is text and numeric, never color-only.`,
    supportsFailure,
    supportsDependencies: true,
    countUnit,
    accessibility: defaultObjectiveAccessibility(type, 0, 1, "INCOMPLETE"),
    debug: `${type} explains progress, events, and missing conditions.`,
    testHarness: true,
    evaluate,
  };
}

export const OBJECTIVE_HANDLERS: readonly ObjectiveHandler[] = [
  spec("collection", "Collect N of a registered target (icon/cell/event).", "icon", (definition, ctx) => evaluateCollection(definition, ctx)),
  spec("clearing", "Clear a registered cell set.", "cell", (definition, ctx) => evaluateClearing(definition, ctx)),
  spec("path", "Establish a graph path. Never uses x/y.", "board-state", (definition, ctx) => evaluatePath(definition, ctx)),
  spec("score", "Ask the score engine whether a threshold was reached.", "score", (definition, ctx) => evaluateScore(definition, ctx)),
  spec("combo", "Count explicit combo events or max combo.", "event", (definition, ctx) => evaluateCombo(definition, ctx)),
  spec("precision", "Satisfy a deterministic efficiency condition.", "move", (definition, ctx) => evaluatePrecision(definition, ctx), true),
  spec("survival", "Survive registered turn/cascade conditions.", "cascade", (definition, ctx) => evaluateSurvival(definition, ctx), true),
  spec("pattern", "Ask the registered pattern/occupancy evaluator.", "board-state", (definition, ctx) => evaluatePattern(definition, ctx)),
  spec("discovery", "React to discovery events or revealed cells.", "unique-target", (definition, ctx) => evaluateDiscovery(definition, ctx)),
  spec(
    "multi-stage",
    "Advance deterministic stages.",
    "stage",
    (definition, ctx, evaluateChild) => evaluateMultiStage(definition, ctx, evaluateChild),
    true,
  ),
  spec("hybrid", "Compose AND / OR / SEQUENCE / NOT trees.", "event", (definition, ctx, evaluateChild) => evaluateHybrid(definition, ctx, evaluateChild), true),
];

export const OBJECTIVE_CATALOG: readonly ObjectiveTypeSpec[] = OBJECTIVE_HANDLERS;

export class ObjectiveRegistry {
  private readonly handlers = new Map<ObjectiveType, ObjectiveHandler>();

  constructor(handlers: readonly ObjectiveHandler[] = OBJECTIVE_HANDLERS) {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  register(handler: ObjectiveHandler): void {
    const issues: ValidationIssue[] = [];
    if (this.handlers.has(handler.type)) {
      issues.push(issue("objective.duplicate_type", `objectives.${handler.type}`, `Objective type "${handler.type}" is already registered.`));
    }
    if (!(OBJECTIVE_TYPES as readonly string[]).includes(handler.type)) {
      issues.push(issue("objective.unknown_register", `objectives.${handler.type}`, `Cannot register unknown objective type "${handler.type}".`));
    }
    if (!handler.version) {
      issues.push(issue("objective.invalid_version", `objectives.${handler.type}.version`, "Objective handler version is required."));
    }
    if (typeof handler.evaluate !== "function") {
      issues.push(issue("objective.missing_handler", `objectives.${handler.type}`, "Objective types must register an evaluate handler. Do not branch on type in the session."));
    }
    throwIfErrors(issues, "Invalid objective handler");
    this.handlers.set(handler.type, handler);
  }

  get(type: ObjectiveType): ObjectiveHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throwIfErrors(
        [issue("objective.unregistered", `objectives.${type}`, `Objective type "${type}" is not registered.`)],
        "Unregistered objective type",
      );
      throw new Error("unreachable");
    }
    return handler;
  }

  has(type: string): type is ObjectiveType {
    return this.handlers.has(type as ObjectiveType);
  }

  list(): ObjectiveHandler[] {
    return [...this.handlers.values()];
  }
}

let defaultRegistry: ObjectiveRegistry | undefined;

export function createObjectiveRegistry(): ObjectiveRegistry {
  return new ObjectiveRegistry();
}

export function getDefaultObjectiveRegistry(): ObjectiveRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ObjectiveRegistry();
  }
  return defaultRegistry;
}

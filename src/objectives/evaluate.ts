import type { CascadeReport } from "../cascade/index.js";
import type { ObjectiveDefinition, ObjectiveEvaluationContext } from "./model.js";
import { evaluateDefinition, handlerResultToProgress } from "./create.js";
import { collectObjectiveTree, dependenciesSatisfied } from "./dependencies.js";
import { createObjectiveEvent, eventsFromCascade } from "./events.js";
import { getDefaultObjectiveRegistry, type ObjectiveRegistry } from "./registry.js";
import { applyHandlerToState, createObjectiveState, serializeObjectiveState } from "./state.js";
import type { ObjectiveEvent, ObjectiveRole, ObjectiveState, WinStateConfig, WinStateResult } from "./types.js";
import { resolveWinState, winConfigFromDefinitions } from "./win-state.js";

export interface ObjectiveRuntime {
  roots: ObjectiveDefinition[];
  states: Record<string, ObjectiveState>;
  events: ObjectiveEvent[];
  sequence: number;
  win: WinStateConfig;
}

export function createObjectiveRuntime(
  roots: ObjectiveDefinition[],
  win?: Partial<WinStateConfig>,
  hasMoveLimit = false,
): ObjectiveRuntime {
  const states: Record<string, ObjectiveState> = {};
  for (const root of roots) {
    for (const node of collectObjectiveTree(root)) {
      states[node.id] = createObjectiveState(node, node.role);
    }
  }
  return {
    roots,
    states,
    events: [],
    sequence: 0,
    win: winConfigFromDefinitions(roots, win, hasMoveLimit),
  };
}

export function evaluateRuntime(
  runtime: ObjectiveRuntime,
  ctx: ObjectiveEvaluationContext,
  registry: ObjectiveRegistry = getDefaultObjectiveRegistry(),
): WinStateResult {
  const statusById = Object.fromEntries(Object.values(runtime.states).map((state) => [state.objectiveId, state.status]));
  for (const root of runtime.roots) {
    refreshNode(root, ctx, runtime, registry, statusById);
  }
  return resolveWinState(Object.values(runtime.states), runtime.win, ctx.movesRemaining);
}

function refreshNode(
  definition: ObjectiveDefinition,
  ctx: ObjectiveEvaluationContext,
  runtime: ObjectiveRuntime,
  registry: ObjectiveRegistry,
  statusById: Record<string, string>,
): void {
  if (definition.type === "multi-stage" && definition.stages?.length) {
    for (const stage of definition.stages) {
      refreshNode(stage, ctx, runtime, registry, statusById);
      if (runtime.states[stage.id]?.status !== "COMPLETE") {
        break;
      }
    }
  } else {
    for (const child of definition.children ?? []) {
      refreshNode(child, ctx, runtime, registry, statusById);
    }
    for (const stage of definition.stages ?? []) {
      refreshNode(stage, ctx, runtime, registry, statusById);
    }
  }
  const state = runtime.states[definition.id] ?? createObjectiveState(definition);
  if ((definition.dependsOn?.length ?? 0) > 0 && !dependenciesSatisfied(definition, statusById)) {
    runtime.states[definition.id] = state;
    return;
  }
  const result = evaluateDefinition(definition, ctx, registry);
  const next = applyHandlerToState(state, result.current, result.target, result.status, result.reason, ctx.events?.at(-1)?.kind, {
    counters: result.counters ?? state.counters,
    seenKeys: result.seenKeys ?? state.seenKeys,
    activeStageId: result.activeStageId,
  });
  if (next.current !== state.current || next.status !== state.status) {
    runtime.sequence += 1;
    runtime.events.push(
      createObjectiveEvent("OBJECTIVE_PROGRESS_CHANGED", runtime.sequence, ctx.phase ?? "level-evaluation", result.reason, {
        data: {
          objectiveId: definition.id,
          previousProgress: state.current,
          newProgress: next.current,
          sourceEvent: ctx.events?.at(-1)?.kind ?? "snapshot",
          reason: result.reason,
        },
      }),
    );
  }
  runtime.states[definition.id] = next;
  statusById[definition.id] = next.status;
}

/** Ingest a newly completed cascade. Do not call twice for the same report. */
export function ingestCascade(runtime: ObjectiveRuntime, report: CascadeReport, ctx: ObjectiveEvaluationContext): WinStateResult {
  const incoming = eventsFromCascade(report, runtime.sequence + 1);
  runtime.events.push(...incoming);
  runtime.sequence += incoming.length;
  return evaluateRuntime(runtime, { ...ctx, phase: "after-cascade", events: runtime.events });
}

export function snapshotProgress(runtime: ObjectiveRuntime, rootId?: string) {
  const id = rootId ?? runtime.roots[0]?.id;
  const state = id ? runtime.states[id] : undefined;
  if (!state) {
    return handlerResultToProgress({ current: 0, target: 1, status: "INCOMPLETE", label: "No objective", reason: "No objective root." });
  }
  return handlerResultToProgress({
    current: state.current,
    target: state.target,
    status: state.status,
    label: state.lastReason ?? state.objectiveId,
    reason: state.lastReason ?? "",
  });
}

export function serializeRuntime(runtime: ObjectiveRuntime): ObjectiveRuntime {
  return {
    roots: runtime.roots,
    states: Object.fromEntries(
      Object.entries(runtime.states)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, state]) => [id, serializeObjectiveState(state)]),
    ),
    events: [...runtime.events],
    sequence: runtime.sequence,
    win: runtime.win,
  };
}

export function roleOf(definition: ObjectiveDefinition): ObjectiveRole {
  return definition.role ?? "required";
}

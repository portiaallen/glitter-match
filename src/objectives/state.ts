import type { ObjectiveDefinition } from "./model.js";
import type { ObjectiveRole, ObjectiveState, ObjectiveStatus } from "./types.js";

export function createObjectiveState(definition: ObjectiveDefinition, role?: ObjectiveRole): ObjectiveState {
  return {
    objectiveId: definition.id,
    objectiveVersion: definition.version ?? "9.0.0",
    type: definition.type,
    role: role ?? definition.role ?? "required",
    status: "INCOMPLETE",
    current: 0,
    target: 0,
    previous: 0,
    counters: {},
    seenKeys: [],
    metadata: {},
  };
}

export function applyHandlerToState(
  state: ObjectiveState,
  current: number,
  target: number,
  status: ObjectiveStatus,
  reason: string,
  eventKind?: ObjectiveState["lastEventKind"],
  extras?: Pick<ObjectiveState, "counters" | "seenKeys" | "activeStageId">,
): ObjectiveState {
  return {
    ...state,
    previous: state.current,
    current,
    target,
    status,
    lastReason: reason,
    lastEventKind: eventKind ?? state.lastEventKind,
    counters: extras?.counters ?? state.counters,
    seenKeys: extras?.seenKeys ?? state.seenKeys,
    activeStageId: extras?.activeStageId ?? state.activeStageId,
  };
}

export function cloneObjectiveState(state: ObjectiveState): ObjectiveState {
  return structuredClone(state);
}

export function serializeObjectiveState(state: ObjectiveState): ObjectiveState {
  return {
    ...state,
    counters: Object.fromEntries(Object.entries(state.counters).sort(([a], [b]) => a.localeCompare(b))),
    seenKeys: [...state.seenKeys].sort(),
    metadata: Object.fromEntries(Object.entries(state.metadata).sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function compareObjectiveState(a: ObjectiveState, b: ObjectiveState): boolean {
  return JSON.stringify(serializeObjectiveState(a)) === JSON.stringify(serializeObjectiveState(b));
}

import type { RuntimeEvent, RuntimeLifecycleState, TurnResult } from "./types.js";

export function explainLifecycle(state: RuntimeLifecycleState): string {
  switch (state) {
    case "UNINITIALIZED":
      return "Runtime has not loaded a level.";
    case "LOADING":
      return "Runtime is validating and initializing a level session.";
    case "READY":
      return "Initial gameplay state is valid and the session can accept play.";
    case "AWAITING_MOVE":
      return "Runtime is waiting for a graph-authoritative player move.";
    case "RESOLVING_MOVE":
      return "A legal move is being applied.";
    case "RESOLVING_MATCHES":
      return "Match Engine resolution has started.";
    case "RESOLVING_SPECIALS":
      return "Special Match Engine resolution has started.";
    case "RESOLVING_CASCADE":
      return "Cascade Engine is settling, refilling, and repeating detection.";
    case "EVALUATING_OBJECTIVES":
      return "Objective Engine is evaluating authoritative progress.";
    case "EVALUATING_OUTCOME":
      return "Win-State Resolver is deciding IN_PROGRESS / COMPLETED / FAILED.";
    case "COMPLETE":
      return "Level session completed. Completion is not mastery.";
    case "FAILED":
      return "Level session failed.";
    case "DEAD_UNRECOVERED":
      return "Fairness recovery could not restore a playable board.";
    case "ERROR":
      return "Runtime hit an unrecoverable error and rolled back to the last committed state when possible.";
  }
}

export function explainTurn(result: TurnResult): string {
  if (result.error) {
    return `${result.error.code}: ${result.error.message}`;
  }
  if (!result.accepted && result.rejection) {
    return `${result.rejection.code}: ${result.rejection.reason}`;
  }
  const outcome = result.outcome?.state ?? "IN_PROGRESS";
  return `MOVE_ACCEPTED turn ${result.turnNumber}; cascades=${result.cascadeCount}; outcome=${outcome}.`;
}

export function formatRuntimeEvents(events: RuntimeEvent[]): string {
  return events.map((event) => `${event.sequence} ${event.kind} ${event.message}`).join("\n");
}

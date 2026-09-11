import type { ObjectiveDefinition } from "./model.js";
import { DEFAULT_WIN_STATE_CONFIG, type ObjectiveState, type WinStateConfig, type WinStateResult } from "./types.js";

export function resolveWinState(
  states: ObjectiveState[],
  config: WinStateConfig = DEFAULT_WIN_STATE_CONFIG,
  movesRemaining: number | null = null,
): WinStateResult {
  const required = states.filter((state) => state.role === "required");
  const optional = states.filter((state) => state.role === "optional");
  const satisfiedRequired = required.filter((state) => state.status === "COMPLETE").map((state) => state.objectiveId);
  const remainingRequired = required.filter((state) => state.status !== "COMPLETE").map((state) => state.objectiveId);
  const failedIds = states.filter((state) => state.status === "FAILED").map((state) => state.objectiveId);
  const optionalComplete = optional.filter((state) => state.status === "COMPLETE").map((state) => state.objectiveId);

  const completion = evaluateCompletion(required, config);
  const failure = evaluateFailure(states, required, config, movesRemaining);

  let state: WinStateResult["state"] = "IN_PROGRESS";
  if (completion && failure) {
    state = config.conflictPolicy === "failure-first" ? "FAILED" : "COMPLETED";
  } else if (completion) {
    state = "COMPLETED";
  } else if (failure) {
    state = "FAILED";
  }

  return {
    state,
    complete: state === "COMPLETED",
    failed: state === "FAILED",
    whyComplete: state === "COMPLETED" ? whyComplete(config, satisfiedRequired) : undefined,
    whyIncomplete: state === "IN_PROGRESS" ? whyIncomplete(config, remainingRequired) : undefined,
    whyFailed: state === "FAILED" ? whyFailed(config, failedIds, movesRemaining) : undefined,
    remainingRequired,
    satisfiedRequired,
    optionalComplete,
    failedIds,
    policy: config,
  };
}

function evaluateCompletion(required: ObjectiveState[], config: WinStateConfig): boolean {
  if (required.length === 0) {
    return false;
  }
  if (config.completionPolicy === "ANY_REQUIRED_OBJECTIVE") {
    return required.some((state) => state.status === "COMPLETE");
  }
  if (config.completionPolicy === "SEQUENCE_COMPLETE") {
    return required.every((state) => state.status === "COMPLETE");
  }
  return required.every((state) => state.status === "COMPLETE");
}

function evaluateFailure(
  all: ObjectiveState[],
  required: ObjectiveState[],
  config: WinStateConfig,
  movesRemaining: number | null,
): boolean {
  if (config.failurePolicy === "NONE") {
    return false;
  }
  if (config.failurePolicy === "MOVE_LIMIT") {
    return movesRemaining === 0 && required.some((state) => state.status !== "COMPLETE");
  }
  if (config.failurePolicy === "ALL_FAILURES") {
    return all.length > 0 && all.every((state) => state.status === "FAILED");
  }
  return all.some((state) => state.status === "FAILED");
}

function whyComplete(config: WinStateConfig, satisfied: string[]): string {
  return `Completion policy ${config.completionPolicy} satisfied by ${satisfied.join(", ") || "no required ids"}. Mastery is separate.`;
}

function whyIncomplete(config: WinStateConfig, remaining: string[]): string {
  return `Completion policy ${config.completionPolicy} still needs: ${remaining.join(", ") || "a required objective"}.`;
}

function whyFailed(config: WinStateConfig, failedIds: string[], movesRemaining: number | null): string {
  if (config.failurePolicy === "MOVE_LIMIT" && movesRemaining === 0) {
    return "Failure policy MOVE_LIMIT: no moves remain and required objectives are incomplete.";
  }
  return `Failure policy ${config.failurePolicy} triggered${failedIds.length ? ` by ${failedIds.join(", ")}` : ""}.`;
}

export function winConfigFromDefinitions(
  roots: ObjectiveDefinition[],
  overrides?: Partial<WinStateConfig>,
  hasMoveLimit = false,
): WinStateConfig {
  void roots;
  return {
    completionPolicy: overrides?.completionPolicy ?? "ALL_REQUIRED_OBJECTIVES",
    failurePolicy: overrides?.failurePolicy ?? (hasMoveLimit ? "MOVE_LIMIT" : "NONE"),
    conflictPolicy: overrides?.conflictPolicy ?? "completion-first",
  };
}

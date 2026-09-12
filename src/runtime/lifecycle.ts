import type { RuntimeLifecycleState } from "./types.js";
import { TERMINAL_RUNTIME_STATES } from "./types.js";

export const RUNTIME_TRANSITIONS: Record<RuntimeLifecycleState, readonly RuntimeLifecycleState[]> = {
  UNINITIALIZED: ["LOADING"],
  LOADING: ["READY", "ERROR"],
  READY: ["AWAITING_MOVE", "COMPLETE", "FAILED", "DEAD_UNRECOVERED", "ERROR"],
  AWAITING_MOVE: ["RESOLVING_MOVE", "ERROR"],
  RESOLVING_MOVE: ["RESOLVING_MATCHES", "AWAITING_MOVE", "ERROR"],
  RESOLVING_MATCHES: ["RESOLVING_SPECIALS", "ERROR"],
  RESOLVING_SPECIALS: ["RESOLVING_CASCADE", "ERROR"],
  RESOLVING_CASCADE: ["EVALUATING_OBJECTIVES", "ERROR"],
  EVALUATING_OBJECTIVES: ["EVALUATING_OUTCOME", "ERROR"],
  EVALUATING_OUTCOME: ["AWAITING_MOVE", "COMPLETE", "FAILED", "DEAD_UNRECOVERED", "ERROR"],
  COMPLETE: [],
  FAILED: [],
  DEAD_UNRECOVERED: [],
  ERROR: [],
};

export function canTransition(from: RuntimeLifecycleState, to: RuntimeLifecycleState): boolean {
  return RUNTIME_TRANSITIONS[from].includes(to);
}

export function isTerminalRuntimeState(state: RuntimeLifecycleState): boolean {
  return (TERMINAL_RUNTIME_STATES as readonly string[]).includes(state);
}

export function isResolvingState(state: RuntimeLifecycleState): boolean {
  return (
    state === "RESOLVING_MOVE" ||
    state === "RESOLVING_MATCHES" ||
    state === "RESOLVING_SPECIALS" ||
    state === "RESOLVING_CASCADE" ||
    state === "EVALUATING_OBJECTIVES" ||
    state === "EVALUATING_OUTCOME"
  );
}

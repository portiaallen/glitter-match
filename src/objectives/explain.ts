import type { ObjectiveState, WinStateResult } from "./types.js";

export function explainObjective(state: ObjectiveState): string {
  const remaining = Math.max(0, state.target - state.current);
  return [
    `WHY ${state.status}? ${state.lastReason ?? "No evaluation yet."}`,
    `WHAT IS THE CURRENT PROGRESS? ${state.current} / ${state.target}`,
    `WHAT EVENT CHANGED IT? ${state.lastEventKind ?? "snapshot"}`,
    `WHAT CONDITION IS STILL MISSING? ${state.status === "INCOMPLETE" ? `${remaining} remain` : "None"}`,
    `ROLE: ${state.role}`,
    `ACTIVE STAGE: ${state.activeStageId ?? "(none)"}`,
  ].join("\n");
}

export function explainWinState(result: WinStateResult): string {
  return [
    `WIN STATE: ${result.state}`,
    result.whyComplete ? `WHY COMPLETE? ${result.whyComplete}` : "",
    result.whyIncomplete ? `WHY INCOMPLETE? ${result.whyIncomplete}` : "",
    result.whyFailed ? `WHY FAILED? ${result.whyFailed}` : "",
    `SATISFIED: ${result.satisfiedRequired.join(", ") || "(none)"}`,
    `REMAINING: ${result.remainingRequired.join(", ") || "(none)"}`,
    `OPTIONAL COMPLETE: ${result.optionalComplete.join(", ") || "(none)"}`,
    `CONFLICT POLICY: ${result.policy.conflictPolicy}`,
  ]
    .filter(Boolean)
    .join("\n");
}

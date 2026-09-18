import { inspectObjectiveRuntime } from "../objectives/index.js";
import { inspectSpecialMatches } from "../special-matches/index.js";
import type { LevelRuntime } from "./runtime.js";
import { explainLifecycle, explainTurn } from "./explain.js";
import type { RuntimeInspection } from "./types.js";

export function inspectLevelRuntime(runtime: LevelRuntime): RuntimeInspection {
  const last = runtime.lastTurn;
  return {
    runtimeId: runtime.runtimeId,
    levelId: runtime.levelId,
    contentVersion: runtime.contentVersion,
    schemaVersion: runtime.schemaVersion,
    seed: runtime.seed,
    lifecycle: runtime.lifecycle,
    turnNumber: runtime.turnNumber,
    attempt: runtime.attempt,
    stateHash: runtime.stateHash(),
    outcome: runtime.inspectWinState(),
    noMatchPolicy: runtime.noMatchPolicy,
    accessibility: { ...runtime.presentation.accessibility },
    explanations: [
      explainLifecycle(runtime.lifecycle),
      last ? explainTurn(last) : "No committed turn yet.",
      runtime.inspectWinState().whyComplete ?? runtime.inspectWinState().whyIncomplete ?? runtime.inspectWinState().whyFailed ?? "",
    ].filter(Boolean),
    events: runtime.events,
    trace: runtime.trace,
  };
}

export function formatRuntimeInspect(runtime: LevelRuntime): string {
  const inspection = inspectLevelRuntime(runtime);
  const specials = inspectSpecialMatches(
    runtime.authoritativeState.board,
    runtime.level.matchRules,
    runtime.registries.icons,
    runtime.authoritativeState.specialMatches,
  );
  const objectives = inspectObjectiveRuntime(runtime.authoritativeState.objectiveRuntime, runtime.objectiveContext());
  return [
    `RUNTIME ${inspection.runtimeId}`,
    `lifecycle: ${inspection.lifecycle}`,
    `level: ${inspection.levelId} content=${inspection.contentVersion} seed=${inspection.seed}`,
    `turn: ${inspection.turnNumber} attempt=${inspection.attempt?.attemptId ?? "none"}`,
    `outcome: ${inspection.outcome.state} (completion ≠ mastery)`,
    `hash: ${inspection.stateHash.slice(0, 80)}…`,
    `no-match policy: ${inspection.noMatchPolicy} (existing swap.requireMatch contract; not a new design rule)`,
    ...inspection.explanations,
    `specials: ${Object.keys(specials.instances).length} instances, ${specials.candidates.length} candidates`,
    objectives.win,
    ...runtime.trace.slice(-12).map((step) => `  ${step.stage}${step.detail ? ` — ${step.detail}` : ""}`),
  ].join("\n");
}

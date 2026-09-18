import type { CascadeReport } from "../cascade/index.js";
import type { EvaluationPhase, ObjectiveEvent, ObjectiveEventKind } from "./types.js";

export function createObjectiveEvent(
  kind: ObjectiveEventKind,
  sequence: number,
  phase: EvaluationPhase,
  message: string,
  extra: Partial<ObjectiveEvent> = {},
): ObjectiveEvent {
  return { kind, sequence, phase, message, ...extra };
}

export function eventsFromCascade(report: CascadeReport, startSequence: number): ObjectiveEvent[] {
  const events: ObjectiveEvent[] = [];
  let sequence = startSequence;
  events.push(createObjectiveEvent("CASCADE_STARTED", sequence, "after-cascade", "Cascade started.", { combo: report.combo }));
  sequence += 1;
  for (const step of report.steps) {
    events.push(
      createObjectiveEvent("CASCADE_STEP", sequence, "after-cascade", `Cascade phase ${step.phase}.`, {
        combo: step.combo,
        cellIds: step.clearedCellIds,
        data: { phase: step.phase },
      }),
    );
    sequence += 1;
    if (step.phase === "resolve") {
      for (const group of step.matches) {
        events.push(
          createObjectiveEvent("MATCH_RESOLVED", sequence, "after-match-resolution", `Resolved ${group.mode} match.`, {
            cellIds: group.cellIds,
            iconId: group.colorIconId,
            combo: step.combo,
          }),
        );
        sequence += 1;
        if (step.combo >= 2) {
          events.push(
            createObjectiveEvent("REGISTERED_COMBO", sequence, "after-match-resolution", `Registered combo ${step.combo}.`, {
              combo: step.combo,
              cellIds: group.cellIds,
            }),
          );
          sequence += 1;
        }
      }
      for (const cellId of step.clearedCellIds) {
        events.push(createObjectiveEvent("CELL_CLEARED", sequence, "after-match-resolution", `Cleared ${cellId}.`, { cellIds: [cellId] }));
        sequence += 1;
      }
    }
  }
  for (const special of report.specialEvents) {
    if (special.kind === "SPECIAL_MATCH_CREATED") {
      events.push(
        createObjectiveEvent("SPECIAL_MATCH_CREATED", sequence, "after-special-resolution", special.message, {
          instanceId: special.instanceId,
          cellIds: special.cellIds,
        }),
      );
      sequence += 1;
    }
    if (special.kind === "SPECIAL_MATCH_ACTIVATED") {
      events.push(
        createObjectiveEvent("SPECIAL_MATCH_ACTIVATED", sequence, "after-special-resolution", special.message, {
          instanceId: special.instanceId,
        }),
      );
      sequence += 1;
    }
    if (special.kind === "SPECIAL_MATCH_RESOLVED") {
      events.push(
        createObjectiveEvent("SPECIAL_MATCH_RESOLVED", sequence, "after-special-resolution", special.message, {
          instanceId: special.instanceId,
        }),
      );
      sequence += 1;
    }
  }
  events.push(
    createObjectiveEvent("CASCADE_COMPLETED", sequence, "after-cascade", `Cascade ${report.termination}.`, {
      combo: report.combo,
      data: { termination: report.termination },
    }),
  );
  return events;
}

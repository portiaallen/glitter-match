import type { ProgressionEvent, ProgressionEventKind } from "./types.js";

export function createProgressionEvent(
  kind: ProgressionEventKind,
  sequence: number,
  message: string,
  extra: Partial<ProgressionEvent> = {},
): ProgressionEvent {
  const id =
    extra.id ??
    (extra.attemptId ? `${extra.attemptId}:${kind}` : `${kind}:${sequence}:${extra.levelId ?? extra.packId ?? extra.landId ?? "universe"}`);
  return {
    id,
    kind,
    sequence,
    message,
    ...extra,
  };
}

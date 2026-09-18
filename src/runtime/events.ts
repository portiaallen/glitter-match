import type { RuntimeEvent, RuntimeEventKind, RuntimeLifecycleState } from "./types.js";

export function createRuntimeEvent(
  sequence: number,
  kind: RuntimeEventKind,
  phase: RuntimeLifecycleState,
  message: string,
  data?: Record<string, unknown>,
): RuntimeEvent {
  return data ? { sequence, kind, phase, message, data } : { sequence, kind, phase, message };
}

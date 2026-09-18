import type { SpecialMatchActivation, SpecialMatchEvent, SpecialMatchInstance } from "./types.js";

export interface SpecialMatchRuntime {
  instances: Record<string, SpecialMatchInstance>;
  pending: SpecialMatchActivation[];
  events: SpecialMatchEvent[];
  activationSeq: number;
  createSeq: number;
  moveIndex: number;
}

export function createSpecialMatchRuntime(moveIndex = 0): SpecialMatchRuntime {
  return {
    instances: {},
    pending: [],
    events: [],
    activationSeq: 0,
    createSeq: 0,
    moveIndex,
  };
}

export function cloneSpecialMatchRuntime(runtime: SpecialMatchRuntime): SpecialMatchRuntime {
  return structuredClone(runtime);
}

export function serializeSpecialMatchRuntime(runtime: SpecialMatchRuntime): SpecialMatchRuntime {
  return {
    instances: Object.fromEntries(
      Object.entries(runtime.instances).sort(([a], [b]) => a.localeCompare(b)).map(([id, instance]) => [id, structuredClone(instance)]),
    ),
    pending: [...runtime.pending].sort((a, b) => a.activationId.localeCompare(b.activationId)),
    events: [...runtime.events],
    activationSeq: runtime.activationSeq,
    createSeq: runtime.createSeq,
    moveIndex: runtime.moveIndex,
  };
}

export function compareSpecialMatchRuntime(a: SpecialMatchRuntime, b: SpecialMatchRuntime): boolean {
  return JSON.stringify(serializeSpecialMatchRuntime(a)) === JSON.stringify(serializeSpecialMatchRuntime(b));
}

export function nextInstanceId(
  runtime: SpecialMatchRuntime,
  typeId: string,
  anchorCellId: string,
  sourceGroupId: string,
): string {
  runtime.createSeq += 1;
  return `sm:${typeId}:${anchorCellId}:${sourceGroupId}:${runtime.moveIndex}:${runtime.createSeq}`;
}

export function nextActivationId(runtime: SpecialMatchRuntime, instanceId: string, trigger: string): string {
  runtime.activationSeq += 1;
  return `act:${runtime.activationSeq}:${instanceId}:${trigger}`;
}

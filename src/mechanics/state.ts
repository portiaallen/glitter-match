import { issue, throwIfErrors } from "../validation.js";

/**
 * Mechanic state lives in serializable game state.
 * Handlers must not hide gameplay-critical data in closures or the DOM.
 */
export interface MechanicState {
  id: string;
  mechanicId: string;
  version: string;
  payload: Record<string, unknown>;
}

export function createMechanicState(
  mechanicId: string,
  version: string,
  payload: Record<string, unknown> = {},
  instanceId = mechanicId,
): MechanicState {
  return {
    id: instanceId,
    mechanicId,
    version,
    payload: { ...payload },
  };
}

export function serializeMechanicState(state: MechanicState): Record<string, unknown> {
  return {
    id: state.id,
    mechanicId: state.mechanicId,
    version: state.version,
    payload: { ...state.payload },
  };
}

export function deserializeMechanicState(raw: Record<string, unknown>): MechanicState {
  const mechanicId = typeof raw.mechanicId === "string" ? raw.mechanicId : "";
  const id = typeof raw.id === "string" ? raw.id : mechanicId;
  const version = typeof raw.version === "string" ? raw.version : "";
  if (!mechanicId || !id || !version) {
    throwIfErrors(
      [issue("mechanic.state_invalid", "mechanicState", "Mechanic state requires id, mechanicId, and version.")],
      "Invalid mechanic state",
    );
  }
  const payload =
    raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload)
      ? { ...(raw.payload as Record<string, unknown>) }
      : {};
  return { id, mechanicId, version, payload };
}

export function compareMechanicState(a: MechanicState, b: MechanicState): boolean {
  return stableStringify(serializeMechanicState(a)) === stableStringify(serializeMechanicState(b));
}

export function cloneMechanicStates(states: Record<string, MechanicState>): Record<string, MechanicState> {
  return Object.fromEntries(
    Object.entries(states).map(([id, state]) => [id, deserializeMechanicState(serializeMechanicState(state))]),
  );
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

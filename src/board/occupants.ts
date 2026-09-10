import type { Occupant } from "./types.js";

export function encodeOccupant(occupant: Occupant): string | null {
  if (occupant.type === "icon") {
    return occupant.iconId;
  }
  if (occupant.type === "special-match") {
    return `special-match:${occupant.typeId}:${occupant.instanceId}`;
  }
  return null;
}

export function decodeOccupant(value: string | null): Occupant {
  if (!value) {
    return { type: "empty" };
  }
  if (value.startsWith("special-match:")) {
    const rest = value.slice("special-match:".length);
    const split = rest.indexOf(":");
    const typeId = split === -1 ? rest : rest.slice(0, split);
    const instanceId = split === -1 ? "" : rest.slice(split + 1);
    if (!typeId || !instanceId) {
      throw new Error(`Malformed special-match occupant encoding "${value}".`);
    }
    return { type: "special-match", typeId, instanceId };
  }
  return { type: "icon", iconId: value };
}

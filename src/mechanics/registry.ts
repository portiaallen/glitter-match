import type { LandId } from "../ids.js";
import { issue, throwIfErrors } from "../validation.js";

export interface MechanicState {
  id: string;
  payload: Record<string, unknown>;
}

export interface MechanicActivation {
  type: "always" | "on-match" | "on-swap" | "on-cascade" | "on-threshold" | "manual";
  config?: Record<string, unknown>;
}

export interface MechanicHandler {
  id: string;
  landId?: LandId;
  implemented: boolean;
  description: string;
  activation: MechanicActivation;
  accessibility: {
    label: string;
    description: string;
    nonColorIndicator: string;
  };
  /**
   * Future Land behavior lives here. The engine asks the registry;
   * it never writes `if (land === ...)`.
   */
  apply?(state: MechanicState, event: Record<string, unknown>): MechanicState;
  serialize?(state: MechanicState): Record<string, unknown>;
  deserialize?(raw: Record<string, unknown>): MechanicState;
}

export interface MechanicDefinition extends MechanicHandler {}

export class MechanicRegistry {
  private readonly mechanics = new Map<string, MechanicHandler>();

  register(mechanic: MechanicHandler): void {
    if (this.mechanics.has(mechanic.id)) {
      throwIfErrors(
        [issue("mechanic.duplicate", `mechanics.${mechanic.id}`, `Mechanic "${mechanic.id}" is already registered.`)],
        "Duplicate mechanic",
      );
    }
    this.mechanics.set(mechanic.id, mechanic);
  }

  get(id: string): MechanicHandler {
    const mechanic = this.mechanics.get(id);
    if (!mechanic) {
      throwIfErrors(
        [issue("mechanic.unknown", `mechanics.${id}`, `Unknown mechanic "${id}". Register it before referencing it in a level.`)],
        "Unknown mechanic",
      );
      throw new Error("unreachable");
    }
    return mechanic;
  }

  has(id: string): boolean {
    return this.mechanics.has(id);
  }

  list(): MechanicHandler[] {
    return [...this.mechanics.values()];
  }

  handlersForLand(landId: LandId): MechanicHandler[] {
    return this.list().filter((mechanic) => mechanic.landId === landId);
  }
}

function reservedLandMechanic(id: string, landId: LandId, description: string): MechanicHandler {
  return {
    id,
    landId,
    implemented: false,
    description,
    activation: { type: "manual" },
    accessibility: {
      label: description,
      description: `${description} is reserved. No gameplay behavior yet.`,
      nonColorIndicator: id,
    },
  };
}

export function createMechanicRegistry(): MechanicRegistry {
  const registry = new MechanicRegistry();
  for (const mechanic of [
    reservedLandMechanic("land.lumina", "lumina", "Reserved Lumina handler"),
    reservedLandMechanic("land.glimmer", "glimmer", "Reserved Glimmer handler"),
    reservedLandMechanic("land.bloomara", "bloomara", "Reserved Bloomara handler"),
    reservedLandMechanic("land.transcendia", "transcendia", "Reserved Transcendia handler"),
    reservedLandMechanic("land.quintara", "quintara", "Reserved Quintara handler"),
    reservedLandMechanic("land.iridescia", "iridescia", "Reserved Iridescia handler"),
    reservedLandMechanic("land.aurelia", "aurelia", "Reserved Aurelia handler"),
    reservedLandMechanic("land.infinity-isles", "infinity-isles", "Reserved Infinity Isles handler"),
  ]) {
    registry.register(mechanic);
  }
  return registry;
}

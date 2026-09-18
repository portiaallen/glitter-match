import type { LandId } from "../ids.js";
import { issue, throwIfErrors } from "../validation.js";
import type { MechanicHandler } from "./contract.js";
import { createDevEchoMechanic } from "./dev.js";
import { reservedLandMechanics } from "./placeholders.js";
import { validateMechanicContract } from "./validate.js";

export class MechanicRegistry {
  private readonly mechanics = new Map<string, MechanicHandler>();

  register(mechanic: MechanicHandler): void {
    if (this.mechanics.has(mechanic.id)) {
      throwIfErrors(
        [issue("mechanic.duplicate", `mechanics.${mechanic.id}`, `Mechanic "${mechanic.id}" is already registered.`)],
        "Duplicate mechanic",
      );
    }
    throwIfErrors(validateMechanicContract(mechanic), `Mechanic "${mechanic.id}" contract is invalid`);
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

  placeholderIds(): string[] {
    return this.list()
      .filter((mechanic) => mechanic.status === "reserved")
      .map((mechanic) => mechanic.id);
  }
}

export function createMechanicRegistry(): MechanicRegistry {
  const registry = new MechanicRegistry();
  for (const mechanic of reservedLandMechanics()) {
    registry.register(mechanic);
  }
  return registry;
}

/** Production placeholders plus the development echo harness mechanic. */
export function createDevelopmentMechanicRegistry(): MechanicRegistry {
  const registry = createMechanicRegistry();
  registry.register(createDevEchoMechanic());
  return registry;
}

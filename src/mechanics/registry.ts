import { issue, throwIfErrors } from "../validation.js";

export interface MechanicDefinition {
  id: string;
  implemented: boolean;
  description: string;
}

export class MechanicRegistry {
  private readonly mechanics = new Map<string, MechanicDefinition>();

  register(mechanic: MechanicDefinition): void {
    if (this.mechanics.has(mechanic.id)) {
      throwIfErrors(
        [issue("mechanic.duplicate", `mechanics.${mechanic.id}`, `Mechanic "${mechanic.id}" is already registered.`)],
        "Duplicate mechanic",
      );
    }
    this.mechanics.set(mechanic.id, mechanic);
  }

  get(id: string): MechanicDefinition {
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

  list(): MechanicDefinition[] {
    return [...this.mechanics.values()];
  }
}

export function createMechanicRegistry(): MechanicRegistry {
  return new MechanicRegistry();
}

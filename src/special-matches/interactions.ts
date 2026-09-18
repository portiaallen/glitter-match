import { issue, throwIfErrors } from "../validation.js";

/**
 * Special Match ↔ Special Match interactions are registered.
 * If none matches, the engine uses a safe default and does not invent a combo.
 */
export const SPECIAL_INTERACTION_IDS = ["strike-activate"] as const;

export interface SpecialInteraction {
  id: string;
  aTypeId: string | "*";
  bTypeId: string | "*";
  when: "strike";
  result: "activate-target" | "ignore";
  description: string;
}

export const DEFAULT_SPECIAL_INTERACTIONS: readonly SpecialInteraction[] = [
  {
    id: "strike-activate",
    aTypeId: "*",
    bTypeId: "*",
    when: "strike",
    result: "activate-target",
    description: "A Special Match effect that targets another Special Match's cell queues the target if it registered the struck trigger.",
  },
];

export class SpecialInteractionRegistry {
  private readonly interactions = new Map<string, SpecialInteraction>();

  constructor(definitions: readonly SpecialInteraction[] = DEFAULT_SPECIAL_INTERACTIONS) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  register(definition: SpecialInteraction): void {
    if (this.interactions.has(definition.id)) {
      throwIfErrors(
        [issue("special.duplicate_interaction", `specialInteractions.${definition.id}`, `Interaction "${definition.id}" is already registered.`)],
        "Duplicate Special Match interaction",
      );
    }
    this.interactions.set(definition.id, definition);
  }

  resolve(aTypeId: string, bTypeId: string, when: "strike"): SpecialInteraction {
    const exact = [...this.interactions.values()].find(
      (item) => item.when === when && item.aTypeId === aTypeId && item.bTypeId === bTypeId,
    );
    if (exact) {
      return exact;
    }
    const wildcard = [...this.interactions.values()].find(
      (item) => item.when === when && (item.aTypeId === "*" || item.aTypeId === aTypeId) && (item.bTypeId === "*" || item.bTypeId === bTypeId),
    );
    if (wildcard) {
      return wildcard;
    }
    return {
      id: "default-ignore",
      aTypeId,
      bTypeId,
      when,
      result: "ignore",
      description: "No registered combo. Safe default: do not invent an interaction.",
    };
  }

  list(): SpecialInteraction[] {
    return [...this.interactions.values()];
  }
}

export function createSpecialInteractionRegistry(): SpecialInteractionRegistry {
  return new SpecialInteractionRegistry();
}

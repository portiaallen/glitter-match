import { issue, throwIfErrors } from "../validation.js";
import { PRIMITIVE_IDS, type PrimitiveDefinition, type PrimitiveId } from "./contract.js";

export class PrimitiveRegistry {
  private readonly primitives = new Map<string, PrimitiveDefinition>();

  register(primitive: PrimitiveDefinition): void {
    if (this.primitives.has(primitive.id)) {
      throwIfErrors(
        [issue("primitive.duplicate", `primitives.${primitive.id}`, `Primitive "${primitive.id}" is already registered.`)],
        "Duplicate primitive",
      );
    }
    if (primitive.deterministic.hiddenRandomness !== false) {
      throwIfErrors(
        [issue("primitive.hidden_rng", `primitives.${primitive.id}`, "Primitives must not hide randomness.")],
        "Invalid primitive",
      );
    }
    if (!primitive.accessibility.nonColorIndicator) {
      throwIfErrors(
        [issue("primitive.a11y", `primitives.${primitive.id}`, "Primitives must declare a non-color indicator.")],
        "Invalid primitive",
      );
    }
    this.primitives.set(primitive.id, primitive);
  }

  get(id: string): PrimitiveDefinition {
    const primitive = this.primitives.get(id);
    if (!primitive) {
      throwIfErrors(
        [issue("primitive.unknown", `primitives.${id}`, `Unknown primitive "${id}".`)],
        "Unknown primitive",
      );
      throw new Error("unreachable");
    }
    return primitive;
  }

  has(id: string): boolean {
    return this.primitives.has(id);
  }

  list(): PrimitiveDefinition[] {
    return [...this.primitives.values()];
  }
}

function describe(
  id: PrimitiveId,
  category: PrimitiveDefinition["category"],
  description: string,
  extra: Partial<PrimitiveDefinition> = {},
): PrimitiveDefinition {
  return {
    id,
    version: "6.0.0",
    category,
    description,
    inputContract: extra.inputContract ?? "typed document",
    stateContract: extra.stateContract ?? "serializable overlay + board",
    effectContract: extra.effectContract ?? "explicit PrimitiveEffect list",
    lifecycleHooks: extra.lifecycleHooks ?? ["validate", "apply", "explain"],
    deterministic: extra.deterministic ?? { required: true, usesRng: false, hiddenRandomness: false },
    accessibility: extra.accessibility ?? {
      label: id,
      description,
      nonColorIndicator: id,
      reducedMotion: "State snaps; no required animation.",
    },
    serialization: { roundTrip: true },
    debug: extra.debug ?? `${id} explains trigger, affected cells/edges, and effects.`,
  };
}

export function createPrimitiveRegistry(): PrimitiveRegistry {
  const registry = new PrimitiveRegistry();
  for (const primitive of [
    describe("state-transition", "state", "Generic A → trigger/condition → B + effects. No Land states."),
    describe("cell-state", "cell", "Named cell states and flag sync. Extensible; not every state is gameplay."),
    describe("occupant-state", "occupant", "Replace, transform, move, swap, rotate, and mark occupants."),
    describe("edge-state", "edge", "Active/traversable plus independent allowsMatch and allowsSwap."),
    describe("topology-mutation", "topology", "Enable/disable/redirect edges and portals with graph validation."),
    describe("temporary-state", "temporary", "Deterministic counters (N moves / until trigger). No wall-clock timers."),
    describe("trigger", "trigger", "Explicit events: move, match, cascade, state and threshold changes."),
    describe("condition", "condition", "Typed AND/OR/NOT conditions. Not a general expression language."),
    describe("effect", "effect", "Ordered, inspectable, serializable gameplay effects."),
    describe("batch-resolution", "batch", "Validate → order → apply all, or reject and roll back."),
    describe("transformation", "transform", "Declared source/destination/trigger/effects/reversibility."),
    describe("pairing", "pairing", "Generic cell/occupant/region relationships. Not Bloomara."),
    describe("synchronization", "synchronization", "Deterministic linked state changes. Not a Land mechanic."),
    describe("region", "region", "Connected graph regions. Never rectangular or x/y inferred."),
    describe("path", "path", "Authored-graph path discovery and validation."),
    describe("threshold", "threshold", "Count/percent/objective/state/multi-stage crossings emit events."),
    describe(
      "controlled-randomness",
      "randomness",
      "SeededRandom only. Must be declared. Not for chaotic puzzles.",
      { deterministic: { required: true, usesRng: true, hiddenRandomness: false } },
    ),
    describe("accessibility-cue", "accessibility", "Presentation announcements, audio, haptics, reduced-motion alternatives."),
  ]) {
    registry.register(primitive);
  }
  if (registry.list().length !== PRIMITIVE_IDS.length) {
    throw new Error("Primitive catalog drifted from PRIMITIVE_IDS.");
  }
  return registry;
}

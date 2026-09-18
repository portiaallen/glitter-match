import { issue, throwIfErrors } from "../validation.js";

/**
 * Mechanical verbs are design vocabulary. A verb does not require its own
 * engine system until a registered mechanic associates with it.
 */
export const CANONICAL_MECHANICAL_VERBS = [
  "illuminate",
  "reflect",
  "reveal",
  "lock",
  "unlock",
  "rotate",
  "synchronize",
  "pair",
  "transform",
  "ascend",
  "elevate",
  "evolve",
  "shift",
  "conceal",
  "misdirect",
  "flow",
  "drift",
  "protect",
  "occupy",
  "fortify",
  "orbit",
  "redirect",
  "connect",
  "separate",
  "spotlight",
  "sequence",
  "wormhole",
] as const;

export type MechanicalVerbId = (typeof CANONICAL_MECHANICAL_VERBS)[number] | (string & {});

export interface MechanicalVerbDefinition {
  id: string;
  description: string;
  mechanicIds: string[];
}

export class MechanicalVerbRegistry {
  private readonly verbs = new Map<string, MechanicalVerbDefinition>();

  register(verb: MechanicalVerbDefinition): void {
    if (this.verbs.has(verb.id)) {
      throwIfErrors(
        [issue("verb.duplicate", `verbs.${verb.id}`, `Mechanical verb "${verb.id}" is already registered.`)],
        "Duplicate mechanical verb",
      );
    }
    this.verbs.set(verb.id, { ...verb, mechanicIds: [...verb.mechanicIds] });
  }

  associate(verbId: string, mechanicId: string): void {
    const verb = this.verbs.get(verbId);
    if (!verb) {
      throwIfErrors(
        [issue("verb.unknown", `verbs.${verbId}`, `Unknown mechanical verb "${verbId}". Register it before associating a mechanic.`)],
        "Unknown mechanical verb",
      );
      return;
    }
    if (!verb.mechanicIds.includes(mechanicId)) {
      verb.mechanicIds.push(mechanicId);
    }
  }

  has(id: string): boolean {
    return this.verbs.has(id);
  }

  get(id: string): MechanicalVerbDefinition {
    const verb = this.verbs.get(id);
    if (!verb) {
      throwIfErrors(
        [issue("verb.unknown", `verbs.${id}`, `Unknown mechanical verb "${id}".`)],
        "Unknown mechanical verb",
      );
      throw new Error("unreachable");
    }
    return verb;
  }

  list(): MechanicalVerbDefinition[] {
    return [...this.verbs.values()];
  }
}

const VERB_NOTES: Record<(typeof CANONICAL_MECHANICAL_VERBS)[number], string> = {
  illuminate: "Make observation meaningful.",
  reflect: "Mirror identity or adjacent state.",
  reveal: "Show previously hidden graph state.",
  lock: "Restrict interaction until a condition is met.",
  unlock: "Restore interaction after a condition is met.",
  rotate: "Advance authored occupant cycles.",
  synchronize: "Keep paired regions in correspondence.",
  pair: "Bind two cells, paths, or chambers.",
  transform: "Evolve an occupant or cell state.",
  ascend: "Progress along an authored elevation path.",
  elevate: "Raise structure or status along graph routes.",
  evolve: "Change state through metamorphosis.",
  shift: "Reconfigure an authored path without x/y inference.",
  conceal: "Hide a route or occupant until revealed.",
  misdirect: "Present a learnable false choice. Never arbitrary RNG.",
  flow: "Move occupants along authored flow edges.",
  drift: "Organic movement along authored currents.",
  protect: "Hold territory or a fortified cell.",
  occupy: "Claim a cell or court.",
  fortify: "Strengthen a defensive structure.",
  orbit: "Cycle occupants along an authored ring.",
  redirect: "Change traversal of an authored edge.",
  connect: "Create or restore graph connectivity.",
  separate: "Break or isolate a relationship.",
  spotlight: "Focus attention on an authored cell or path.",
  sequence: "Require an ordered performance of moves.",
  wormhole: "Portal-like connectivity between islands.",
};

export function createMechanicalVerbRegistry(): MechanicalVerbRegistry {
  const registry = new MechanicalVerbRegistry();
  for (const id of CANONICAL_MECHANICAL_VERBS) {
    registry.register({
      id,
      description: VERB_NOTES[id],
      mechanicIds: [],
    });
  }
  return registry;
}

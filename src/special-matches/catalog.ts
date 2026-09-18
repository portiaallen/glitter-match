import type { SpecialMatchTypeDefinition } from "./registry.js";
import { defaultSpecialAccessibility } from "./types.js";
import { areaClearEffects, crossClearEffects, lineClearEffects } from "./effects.js";

function base(
  id: "line-clear" | "area-clear" | "cross-clear",
  eligibility: string[],
  priority: number,
  emit: SpecialMatchTypeDefinition["emitEffects"],
): SpecialMatchTypeDefinition {
  return {
    id,
    version: "8.0.0",
    displayName: id,
    debugName: `generic-${id}`,
    category: id,
    creationEligibility: eligibility,
    anchorPolicy: "authored-candidate",
    matchedCellPolicy: "preserve-anchor",
    activationTriggers: ["direct", "matched", "adjacent-match", "struck"],
    consumption: "consumed",
    priority,
    interactionWithOrdinaryMatches: "Effects change occupants; ordinary matching runs afterward.",
    interactionWithOtherSpecials: "Struck specials activate only if they register the struck trigger. No invented combos.",
    interactionWithCascades: "Created specials do not auto-fire on the creating combo.",
    interactionWithObstacles: "Obstacle registry decides apply/block/weaken. Specials do not hardcode obstacle ids.",
    interactionWithTopology: "Walks authored directed edges only. Never x/y.",
    deterministic: true,
    accessibility: defaultSpecialAccessibility(id, "anchor"),
    debug: `${id} explains creation, anchor, effects, and cascade continuation.`,
    serialization: { roundTrip: true },
    validationNotes: "Fail loudly on unknown type, trigger, or policy.",
    testHarness: true,
    emitEffects: emit,
  };
}

export const BUILT_IN_SPECIAL_MATCH_TYPES: readonly SpecialMatchTypeDefinition[] = [
  base("cross-clear", ["cross", "T"], 50, (ctx) => crossClearEffects(ctx.board, ctx.instance)),
  base("line-clear", ["line-5", "line-4", "line"], 25, (ctx) => lineClearEffects(ctx.board, ctx.instance)),
  base("area-clear", ["L", "cluster-special"], 15, (ctx) => areaClearEffects(ctx.board, ctx.instance)),
];

import { referencedLevelIds } from "./graph.js";
import { campaignProgress, type ProgressionRuntime } from "./resolver.js";
import { viewStatus } from "./types.js";

export function explainLevel(runtime: ProgressionRuntime, levelId: string): string {
  const node = runtime.catalog.find((item) => item.id === levelId);
  const state = runtime.player.levels[levelId];
  if (!node || !state) {
    return `Level: ${levelId}\nStatus: UNAVAILABLE\nReason: Unknown level id.`;
  }
  const status = viewStatus(state);
  const missing = referencedLevelIds(node.unlock).filter((id) => !runtime.player.levels[id]?.completion.completed);
  return [
    `Level: ${levelId}`,
    `Status: ${status}`,
    status === "LOCKED"
      ? `WHY IS THIS LEVEL LOCKED?\nMissing prerequisite:\n${missing.join("\n") || "(condition unsatisfied)"}\nRequired condition:\nCOMPLETED\nCurrent state:\nINCOMPLETE`
      : "WHY DID THIS LEVEL UNLOCK? Unlock condition evaluated true.",
    `WHAT PREREQUISITE IS MISSING? ${missing.join(", ") || "None"}`,
    `Availability: ${state.availability}`,
    `Completion: ${state.completion.completed ? "COMPLETED" : "INCOMPLETE"} (${state.completion.completionCount})`,
    `Mastery: ${state.mastery.state}`,
  ].join("\n");
}

export function explainLand(runtime: ProgressionRuntime, landId: string): string {
  const land = campaignProgress(runtime).lands.find((item) => item.landId === landId);
  if (!land) {
    return `Land: ${landId}\nWHY IS THIS LAND INCOMPLETE? Unknown land.`;
  }
  const missing = runtime.catalog
    .filter((node) => node.landId === landId && node.required && node.kind !== "post-campaign" && node.kind !== "finale")
    .filter((node) => !runtime.player.levels[node.id]?.completion.completed)
    .map((node) => node.id);
  return [
    `Land: ${landId}`,
    `Complete: ${land.complete}`,
    land.complete ? "WHY IS THIS LAND INCOMPLETE? It is complete." : `WHY IS THIS LAND INCOMPLETE? Missing required levels: ${missing.join(", ") || "(none)"}`,
    `Finale eligible: ${land.finaleEligible}`,
    land.finaleEligible ? "WHY IS THIS FINALE INELIGIBLE? It is eligible." : "WHY IS THIS FINALE INELIGIBLE? Registered finale prerequisites are unmet.",
  ].join("\n");
}

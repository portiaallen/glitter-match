import { campaignProgress, nodeView, type ProgressionRuntime } from "./resolver.js";
import { explainLand, explainLevel } from "./explain.js";
import { serializeProgression } from "./serialize.js";
import { defaultProgressionAccessibility, viewStatus } from "./types.js";
import { validatePlayerProgress, validateUniverseContent } from "./validate.js";

export function inspectProgression(runtime: ProgressionRuntime, focusLevelId?: string) {
  const campaign = campaignProgress(runtime);
  const levels = Object.fromEntries(
    [...runtime.catalog]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => {
        const state = runtime.player.levels[node.id]!;
        const status = viewStatus(state);
        return [
          node.id,
          {
            status,
            availability: state.availability,
            completed: state.completion.completed,
            mastered: state.mastery.mastered,
            accessibility: defaultProgressionAccessibility(status, node.accessibilityLabel),
            explanation: explainLevel(runtime, node.id),
          },
        ];
      }),
  );
  return {
    universeId: runtime.universe.id,
    purpose: runtime.universe.purpose,
    campaign,
    levels,
    events: runtime.player.events,
    serialized: JSON.stringify(serializeProgression(runtime)),
    validation: [...validateUniverseContent(runtime.universe, runtime.catalog), ...validatePlayerProgress(runtime.universe, runtime.catalog, runtime.player)],
    focus: focusLevelId
      ? {
          view: nodeView(runtime, focusLevelId),
          explanation: explainLevel(runtime, focusLevelId),
          land: explainLand(runtime, runtime.catalog.find((node) => node.id === focusLevelId)?.landId ?? ""),
        }
      : undefined,
  };
}

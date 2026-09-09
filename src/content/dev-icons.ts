/**
 * DEVELOPMENT-ONLY icon fixtures.
 * These are not production Land families and must never ship as content.
 */
import type { IconRegistry } from "../icons/index.js";

export const DEV_ICON_IDS = ["dev.spark-a", "dev.spark-b", "dev.spark-c"] as const;

export function registerDevIcons(registry: IconRegistry): void {
  registry.register({
    id: "dev.spark-a",
    kind: "dev",
    note: "Development fixture. Not a Land family.",
    presentation: { displayName: "Dev Spark A", patternId: "triangle" },
  });
  registry.register({
    id: "dev.spark-b",
    kind: "dev",
    note: "Development fixture. Not a Land family.",
    presentation: { displayName: "Dev Spark B", patternId: "circle" },
  });
  registry.register({
    id: "dev.spark-c",
    kind: "dev",
    note: "Development fixture. Not a Land family.",
    presentation: { displayName: "Dev Spark C", patternId: "diamond" },
  });
}

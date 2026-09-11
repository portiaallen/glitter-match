import type { ProgressionNode, UniverseContent } from "./types.js";
import { PROGRESSION_SCHEMA_VERSION } from "./types.js";

const VERSION = PROGRESSION_SCHEMA_VERSION;
const LAND = "lumina";
const PACK = "dev.pack.progression";
const UNIVERSE = "dev.universe";

function node(id: string, unlock: ProgressionNode["unlock"], extra: Partial<ProgressionNode> = {}): ProgressionNode {
  const kind = extra.kind ?? "campaign-level";
  return {
    id,
    version: VERSION,
    kind,
    landId: LAND,
    packId: PACK,
    required: extra.required ?? (kind !== "finale" && kind !== "post-campaign"),
    unlock,
    bestResultStrategy: extra.bestResultStrategy ?? "higher-score",
    masteryVersion: VERSION,
    accessibilityLabel: extra.accessibilityLabel ?? id,
    purpose: "engine-fixture",
  };
}

/** ENGINE TEST FIXTURE ONLY. Not a Glitter Match campaign, Land pack, finale, or player-visible level. */
export const DEV_PROGRESSION_CATALOG: ProgressionNode[] = [
  node("dev.level.root", { op: "always" }, { accessibilityLabel: "Root fixture level" }),
  node("dev.level.linear", { op: "level-completed", levelId: "dev.level.root" }, { accessibilityLabel: "Linear unlock" }),
  node("dev.level.branch-a", { op: "level-completed", levelId: "dev.level.root" }, { accessibilityLabel: "Branch A" }),
  node("dev.level.branch-b", { op: "level-completed", levelId: "dev.level.root" }, { accessibilityLabel: "Branch B" }),
  node(
    "dev.level.and",
    {
      op: "and",
      children: [
        { op: "level-completed", levelId: "dev.level.branch-a" },
        { op: "level-completed", levelId: "dev.level.branch-b" },
      ],
    },
    { accessibilityLabel: "AND unlock" },
  ),
  node(
    "dev.level.or",
    {
      op: "or",
      children: [
        { op: "level-completed", levelId: "dev.level.branch-a" },
        { op: "level-completed", levelId: "dev.level.branch-b" },
      ],
    },
    { accessibilityLabel: "OR unlock" },
  ),
  node(
    "dev.level.threshold",
    {
      op: "count",
      threshold: 2,
      children: [
        { op: "level-completed", levelId: "dev.level.linear" },
        { op: "level-completed", levelId: "dev.level.branch-a" },
        { op: "level-completed", levelId: "dev.level.branch-b" },
      ],
    },
    { accessibilityLabel: "Threshold unlock" },
  ),
  node(
    "dev.level.capstone",
    {
      op: "and",
      children: [
        { op: "level-completed", levelId: "dev.level.and" },
        { op: "level-completed", levelId: "dev.level.threshold" },
      ],
    },
    { kind: "finale", required: false, accessibilityLabel: "Fixture capstone (not a Land 80 finale)" },
  ),
  node(
    "dev.level.post",
    { op: "level-completed", levelId: "dev.level.capstone" },
    { kind: "post-campaign", required: false, accessibilityLabel: "Post-campaign extension node" },
  ),
];

export const DEV_PROGRESSION_UNIVERSE: UniverseContent = {
  id: UNIVERSE,
  version: VERSION,
  title: "DEV: Progression engine universe — not campaign content",
  purpose: "engine-fixture",
  landIds: [LAND],
  notes: "ENGINE TEST FIXTURE ONLY. References Land Registry id lumina as a land handle, not Lumina campaign levels.",
  lands: [
    {
      landId: LAND,
      packIds: [PACK],
      completionPolicy: "ALL_REQUIRED_LEVELS",
      finaleNodeId: "dev.level.capstone",
    },
  ],
  packs: [
    {
      id: PACK,
      version: VERSION,
      universeId: UNIVERSE,
      landId: LAND,
      title: "DEV: Progression pack — not a production pack",
      purpose: "engine-fixture",
      nodeIds: DEV_PROGRESSION_CATALOG.map((item) => item.id),
      edges: [
        { from: "dev.level.root", to: "dev.level.linear" },
        { from: "dev.level.root", to: "dev.level.branch-a" },
        { from: "dev.level.root", to: "dev.level.branch-b" },
        { from: "dev.level.branch-a", to: "dev.level.and" },
        { from: "dev.level.branch-b", to: "dev.level.and" },
        { from: "dev.level.branch-a", to: "dev.level.or" },
        { from: "dev.level.branch-b", to: "dev.level.or" },
        { from: "dev.level.linear", to: "dev.level.threshold" },
        { from: "dev.level.and", to: "dev.level.capstone" },
        { from: "dev.level.capstone", to: "dev.level.post" },
      ],
      notes: "ENGINE TEST FIXTURE ONLY. Not Level 1, not 640, not a finale.",
    },
  ],
};

export const PROGRESSION_FIXTURE_FILE = "data/lab/progression/dev-universe.json";

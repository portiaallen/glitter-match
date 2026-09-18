/**
 * Development-only match-engine fixtures. Not campaign levels.
 * Kept out of LAB_FIXTURE_IDS so the Board Lab catalog stays topology-focused.
 */
export const MATCH_ENGINE_FIXTURE_IDS = [
  "match.irregular-standard",
  "match.directional",
  "match.pattern-l",
  "match.pattern-t",
  "match.pattern-cross",
  "match.cluster",
  "match.cycle-ring",
  "match.path",
  "match.overlapping",
  "match.wildcard",
  "match.failed-pattern",
  "match.blocked-edge",
  "match.disconnected",
] as const;

export type MatchEngineFixtureId = (typeof MATCH_ENGINE_FIXTURE_IDS)[number];

export const MATCH_ENGINE_FIXTURE_FILES: Record<MatchEngineFixtureId, string> = {
  "match.irregular-standard": "data/lab/match/irregular-standard.json",
  "match.directional": "data/lab/match/directional.json",
  "match.pattern-l": "data/lab/match/pattern-l.json",
  "match.pattern-t": "data/lab/match/pattern-t.json",
  "match.pattern-cross": "data/lab/match/pattern-cross.json",
  "match.cluster": "data/lab/match/cluster.json",
  "match.cycle-ring": "data/lab/match/cycle-ring.json",
  "match.path": "data/lab/match/path.json",
  "match.overlapping": "data/lab/match/overlapping.json",
  "match.wildcard": "data/lab/match/wildcard.json",
  "match.failed-pattern": "data/lab/match/failed-pattern.json",
  "match.blocked-edge": "data/lab/match/blocked-edge.json",
  "match.disconnected": "data/lab/match/disconnected.json",
};

export const OBJECTIVE_FIXTURE_IDS = [
  "objective.collection",
  "objective.clearing",
  "objective.score",
  "objective.path",
  "objective.pattern",
  "objective.combo",
  "objective.survival",
  "objective.staged",
  "objective.and",
  "objective.or",
  "objective.sequence",
  "objective.failure",
] as const;

export type ObjectiveFixtureId = (typeof OBJECTIVE_FIXTURE_IDS)[number];

export const OBJECTIVE_FIXTURE_FILES: Record<ObjectiveFixtureId, string> = {
  "objective.collection": "data/lab/objectives/collection.json",
  "objective.clearing": "data/lab/objectives/clearing.json",
  "objective.score": "data/lab/objectives/score.json",
  "objective.path": "data/lab/objectives/path.json",
  "objective.pattern": "data/lab/objectives/pattern.json",
  "objective.combo": "data/lab/objectives/combo.json",
  "objective.survival": "data/lab/objectives/survival.json",
  "objective.staged": "data/lab/objectives/staged.json",
  "objective.and": "data/lab/objectives/and.json",
  "objective.or": "data/lab/objectives/or.json",
  "objective.sequence": "data/lab/objectives/sequence.json",
  "objective.failure": "data/lab/objectives/failure.json",
};

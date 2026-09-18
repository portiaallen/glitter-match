export const SPECIAL_MATCH_FIXTURE_IDS = [
  "special.line-create",
  "special.adjacent-trigger",
] as const;

export type SpecialMatchFixtureId = (typeof SPECIAL_MATCH_FIXTURE_IDS)[number];

export const SPECIAL_MATCH_FIXTURE_FILES: Record<SpecialMatchFixtureId, string> = {
  "special.line-create": "data/lab/special/line-create.json",
  "special.adjacent-trigger": "data/lab/special/adjacent-trigger.json",
};

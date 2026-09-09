export const MATCH_MODES = ["cluster", "aligned", "corner", "tee", "cross"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export interface MatchRules {
  minGroupSize: number;
  modes: MatchMode[];
}

export function defaultMatchRules(): MatchRules {
  return { minGroupSize: 3, modes: ["cluster"] };
}

export interface MatchGroup {
  cellIds: string[];
  colorIconId: string;
  mode: MatchMode;
  /** Present when an aligned/pattern mode produced the group. */
  pattern?: "line" | "corner" | "tee" | "cross";
}

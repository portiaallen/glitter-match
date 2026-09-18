export const REWARD_KINDS = [
  "score",
  "currency",
  "special-icon",
  "progression",
  "glitter-chips",
  "glitter-gems",
  "cosmetics",
  "collectibles",
  "trophies",
  "achievements",
  "museum-entry",
  "sanctuary-artifact",
  "story-unlock",
  "gate-memory",
] as const;

export type RewardKind = (typeof REWARD_KINDS)[number];

export interface RewardDefinition {
  kind: RewardKind;
  id?: string;
  amount: number;
}

export interface EarnedReward extends RewardDefinition {
  source: "level-clear" | "mastery" | "cascade" | "discovery";
}

export function validateReward(reward: RewardDefinition, path: string): string | null {
  if (!Number.isFinite(reward.amount) || reward.amount < 0) {
    return `${path}: reward amount must be a non-negative number.`;
  }
  if ((reward.kind === "special-icon" || reward.kind === "museum-entry" || reward.kind === "sanctuary-artifact" || reward.kind === "story-unlock" || reward.kind === "gate-memory" || reward.kind === "cosmetics" || reward.kind === "collectibles" || reward.kind === "trophies" || reward.kind === "achievements") && !reward.id) {
    return `${path}: ${reward.kind} rewards require an id reference.`;
  }
  return null;
}

export const REWARD_KINDS = ["score", "currency", "special-icon", "progression"] as const;
export type RewardKind = (typeof REWARD_KINDS)[number];

export interface RewardDefinition {
  kind: RewardKind;
  id?: string;
  amount: number;
}

export interface EarnedReward extends RewardDefinition {
  source: "level-clear" | "mastery" | "cascade";
}

export function validateReward(reward: RewardDefinition, path: string): string | null {
  if (!Number.isFinite(reward.amount) || reward.amount < 0) {
    return `${path}: reward amount must be a non-negative number.`;
  }
  if (reward.kind === "special-icon" && !reward.id) {
    return `${path}: special-icon rewards require an id.`;
  }
  return null;
}

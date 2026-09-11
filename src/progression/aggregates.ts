import type { LandCompletionPolicy, ProgressionNode, UniverseContent } from "./types.js";

export interface PackProgress {
  packId: string;
  totalLevels: number;
  availableLevels: number;
  completedLevels: number;
  masteredLevels: number;
  lockedLevels: number;
  completionRatio: number;
  masteryRatio: number;
  complete: boolean;
}

export interface LandProgress {
  landId: string;
  packIds: string[];
  totalLevels: number;
  availableLevels: number;
  completedLevels: number;
  masteredLevels: number;
  completionRatio: number;
  masteryRatio: number;
  complete: boolean;
  finaleEligible: boolean;
}

export interface CampaignProgress {
  universeId: string;
  lands: LandProgress[];
  packs: PackProgress[];
  totalLevels: number;
  completedLevels: number;
  masteredLevels: number;
  completionRatio: number;
  masteryRatio: number;
}

export function requiredNodes(catalog: readonly ProgressionNode[], packId?: string): ProgressionNode[] {
  return catalog.filter((node) => node.required && node.kind !== "post-campaign" && (!packId || node.packId === packId));
}

export function evaluateLandComplete(
  policy: LandCompletionPolicy,
  required: readonly ProgressionNode[],
  completedIds: ReadonlySet<string>,
  finaleNodeId: string | undefined,
  threshold: number | undefined,
): boolean {
  if (required.length === 0) {
    return false;
  }
  if (policy === "FINALE_COMPLETION") {
    return Boolean(finaleNodeId && completedIds.has(finaleNodeId));
  }
  if (policy === "REQUIRED_THRESHOLD") {
    const done = required.filter((node) => completedIds.has(node.id)).length;
    return done >= (threshold ?? required.length);
  }
  return required.every((node) => completedIds.has(node.id));
}

export function landPolicyFor(universe: UniverseContent, landId: string): { policy: LandCompletionPolicy; threshold?: number; finaleNodeId?: string } {
  const land = universe.lands.find((item) => item.landId === landId);
  return {
    policy: land?.completionPolicy ?? "ALL_REQUIRED_LEVELS",
    threshold: land?.requiredThreshold,
    finaleNodeId: land?.finaleNodeId,
  };
}

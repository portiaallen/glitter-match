import { evaluateUnlock, type UnlockEvaluationContext } from "./unlock.js";
import type { ProgressionNode, UnlockCondition } from "./types.js";

export function finaleEligible(node: ProgressionNode, ctx: UnlockEvaluationContext, extra?: UnlockCondition): boolean {
  if (node.kind !== "finale") {
    return false;
  }
  if (extra && !evaluateUnlock(extra, ctx)) {
    return false;
  }
  return evaluateUnlock(node.unlock, ctx);
}

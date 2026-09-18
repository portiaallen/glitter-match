import { getCell } from "../board/index.js";
import type { CompareOp, Condition, PrimitiveTrigger } from "./contract.js";
import { discoverRegion } from "./graph.js";
import { hasCellState, type PrimitiveRuntime } from "./runtime.js";
import { edgeOverlay } from "./runtime.js";

export function evaluateCondition(
  condition: Condition,
  runtime: PrimitiveRuntime,
  trigger?: PrimitiveTrigger,
): boolean {
  switch (condition.type) {
    case "always":
      return true;
    case "never":
      return false;
    case "and":
      return condition.of.every((child) => evaluateCondition(child, runtime, trigger));
    case "or":
      return condition.of.some((child) => evaluateCondition(child, runtime, trigger));
    case "not":
      return !evaluateCondition(condition.of, runtime, trigger);
    case "cell-has-state":
      return hasCellState(runtime, condition.cellId, condition.state);
    case "cell-contains-icon": {
      const occupant = getCell(runtime.board, condition.cellId).occupant;
      return occupant.type === "icon" && occupant.iconId === condition.iconId;
    }
    case "edge-has-state":
      return edgeOverlay(runtime, condition.edgeKey)[condition.field] === condition.value;
    case "objective-progress":
      return compare(runtime.counters.objective[condition.key] ?? 0, condition.op, condition.value);
    case "move-count":
      return compare(runtime.counters.moves, condition.op, condition.value);
    case "cascade-count":
      return compare(runtime.counters.cascades, condition.op, condition.value);
    case "mechanic-state":
      return runtime.mechanicPayload[condition.path] === condition.equals;
    case "connected-region-exists": {
      if (condition.cellIds.length === 0) {
        return false;
      }
      const region = discoverRegion(runtime, condition.cellIds[0]!);
      return condition.cellIds.every((id) => region.cellIds.includes(id));
    }
    case "pattern-exists":
      return condition.cellIds.every((id) => {
        const occupant = getCell(runtime.board, id).occupant;
        return occupant.type === "icon" && occupant.iconId === condition.iconId;
      });
    default:
      return false;
  }
}

function compare(left: number, op: CompareOp, right: number): boolean {
  if (op === "==") {
    return left === right;
  }
  if (op === ">=") {
    return left >= right;
  }
  if (op === "<=") {
    return left <= right;
  }
  return left > right;
}

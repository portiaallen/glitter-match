import { getCell } from "../board/index.js";
import { GLITTER_ICON_ID } from "../ids.js";
import { SPECIAL_ICON_IDS } from "../special-icons/index.js";
import { issue, type ValidationIssue } from "../validation.js";
import {
  graphEdgeKey,
  parseEdgeKey,
  type CellPrimitiveState,
  type EdgeOverlay,
  type PrimitiveEffect,
  type PrimitiveEvent,
  type PrimitiveExplanation,
} from "./contract.js";
import { clonePrimitiveRuntime, defaultEdgeOverlay, edgeOverlay, replaceRuntime, type PrimitiveRuntime } from "./runtime.js";

const KIND_PRIORITY: Record<PrimitiveEffect["kind"], number> = {
  "presentation-cue": 0,
  "emit-discovery": 1,
  "modify-objective": 2,
  "advance-threshold": 3,
  "create-temporary": 4,
  "remove-temporary": 5,
  "upsert-relationship": 6,
  "remove-relationship": 7,
  "sync-members": 8,
  "change-cell-state": 10,
  "change-edge-state": 11,
  "enable-edge": 12,
  "disable-edge": 13,
  "open-route": 14,
  "close-route": 15,
  "redirect-edge": 16,
  "activate-portal": 17,
  "deactivate-portal": 18,
  "mark-occupant": 20,
  "change-occupant": 21,
  "transform-occupant": 22,
  "move-occupant": 23,
  "swap-occupants": 24,
  "rotate-occupants": 25,
};

export interface BatchResult {
  ok: boolean;
  runtime: PrimitiveRuntime;
  applied: PrimitiveEffect[];
  events: PrimitiveEvent[];
  explanation: PrimitiveExplanation;
  issues: ValidationIssue[];
}

export function orderEffects(effects: PrimitiveEffect[]): PrimitiveEffect[] {
  return effects
    .map((effect, index) => ({ effect, index }))
    .sort((left, right) => {
      const priority =
        (left.effect.priority ?? KIND_PRIORITY[left.effect.kind]) -
        (right.effect.priority ?? KIND_PRIORITY[right.effect.kind]);
      if (priority !== 0) {
        return priority;
      }
      const target = effectTarget(left.effect).localeCompare(effectTarget(right.effect));
      if (target !== 0) {
        return target;
      }
      return left.index - right.index;
    })
    .map((item) => item.effect);
}

export function detectEffectConflicts(effects: PrimitiveEffect[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, PrimitiveEffect>();
  for (const effect of effects) {
    const target = effectTarget(effect);
    if (!target) {
      continue;
    }
    const prior = seen.get(target);
    if (prior && prior.kind !== effect.kind) {
      issues.push(
        issue(
          "primitive.effect_conflict",
          `effects.${target}`,
          `Conflicting effects on ${target}: ${prior.kind} vs ${effect.kind}. The engine does not pick an arbitrary winner.`,
        ),
      );
    } else if (prior && JSON.stringify(prior) !== JSON.stringify(effect)) {
      issues.push(
        issue(
          "primitive.effect_conflict",
          `effects.${target}`,
          `Ambiguous ${effect.kind} operations on ${target}.`,
        ),
      );
    } else {
      seen.set(target, effect);
    }
  }
  return issues;
}

export function applyEffectBatch(runtime: PrimitiveRuntime, effects: PrimitiveEffect[]): BatchResult {
  const snapshot = clonePrimitiveRuntime(runtime);
  const ordered = orderEffects(effects);
  const issues = [...detectEffectConflicts(ordered)];
  for (const [index, effect] of ordered.entries()) {
    issues.push(...validateEffect(snapshot, effect, index));
  }
  if (issues.length > 0) {
    return {
      ok: false,
      runtime,
      applied: [],
      events: [],
      issues,
      explanation: {
        what: "Effect batch rejected",
        why: issues.map((item) => item.message).join(" "),
        changedCells: [],
        changedEdges: [],
        effects: ordered,
        events: [],
        failure: issues[0]?.message,
      },
    };
  }

  const events: PrimitiveEvent[] = [];
  const applied: PrimitiveEffect[] = [];
  for (const effect of ordered) {
    applyEffect(snapshot, effect, events);
    applied.push(effect);
  }
  issues.push(...validateRuntimeGraph(snapshot));
  if (issues.length > 0) {
    return {
      ok: false,
      runtime,
      applied: [],
      events: [],
      issues,
      explanation: {
        what: "Effect batch rolled back",
        why: issues.map((item) => item.message).join(" "),
        changedCells: [],
        changedEdges: [],
        effects: ordered,
        events: [],
        failure: issues[0]?.message,
      },
    };
  }

  replaceRuntime(runtime, snapshot);
  runtime.events.push(...events);
  return {
    ok: true,
    runtime,
    applied,
    events,
    issues: [],
    explanation: explainBatch(applied, events),
  };
}

function effectTarget(effect: PrimitiveEffect): string {
  if (effect.edgeKey) {
    return `edge:${effect.edgeKey}`;
  }
  if (effect.cellIds?.length === 1) {
    return `cell:${effect.cellIds[0]}`;
  }
  if (effect.from && effect.to) {
    return `pair:${[effect.from, effect.to].sort().join(":")}`;
  }
  if (effect.cycle) {
    return `cycle:${[...effect.cycle].sort().join(",")}`;
  }
  if (effect.temporaryId || effect.temporary) {
    return `temp:${effect.temporaryId ?? effect.temporary?.id}`;
  }
  if (effect.relationshipId || effect.relationship) {
    return `rel:${effect.relationshipId ?? effect.relationship?.id}`;
  }
  if (effect.thresholdId) {
    return `threshold:${effect.thresholdId}`;
  }
  if (effect.objectiveKey) {
    return `objective:${effect.objectiveKey}`;
  }
  if (effect.syncId) {
    return `sync:${effect.syncId}`;
  }
  return effect.kind;
}

function validateEffect(runtime: PrimitiveRuntime, effect: PrimitiveEffect, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const path = `effects[${index}]`;
  const cells = effect.cellIds ?? [effect.from, effect.to, ...(effect.cycle ?? [])].filter(Boolean) as string[];
  for (const cellId of cells) {
    if (!runtime.board.topology.cells[cellId]) {
      issues.push(issue("primitive.unknown_cell", path, `Unknown cell "${cellId}".`));
    }
  }
  if (effect.edgeKey && !parseEdgeKey(effect.edgeKey)) {
    issues.push(issue("primitive.bad_edge", path, `Invalid edge key "${effect.edgeKey}".`));
  }
  if (effect.kind === "redirect-edge" && effect.redirectTo && !runtime.board.topology.cells[effect.redirectTo]) {
    issues.push(issue("primitive.unknown_redirect", path, `Redirect target "${effect.redirectTo}" does not exist.`));
  }
  const occupant = effect.occupant ?? effect.fromOccupant;
  if (occupant?.type === "icon") {
    if ((SPECIAL_ICON_IDS as readonly string[]).includes(occupant.iconId)) {
      issues.push(
        issue(
          "primitive.special_icon",
          path,
          `Primitives may not create Special Icon occupants. "${occupant.iconId}" stays universal inventory.`,
        ),
      );
    }
  }
  if (effect.payload && "landId" in effect.payload && effect.payload.iconId === GLITTER_ICON_ID) {
    issues.push(issue("primitive.glitter_land", path, "Primitives must not assign the Glitter Icon to a Land."));
  }
  if (effect.kind === "swap-occupants" && (!effect.from || !effect.to)) {
    issues.push(issue("primitive.swap_cells", path, "swap-occupants requires from and to cell ids."));
  }
  return issues;
}

function applyEffect(runtime: PrimitiveRuntime, effect: PrimitiveEffect, events: PrimitiveEvent[]): void {
  switch (effect.kind) {
    case "change-cell-state":
      if (effect.cellIds?.[0] && effect.cellState) {
        setCellState(runtime, effect.cellIds[0], effect.cellState);
        events.push({ kind: "cell-change", description: `${effect.cellIds[0]} → ${effect.cellState}`, cellIds: effect.cellIds });
      }
      break;
    case "change-occupant":
    case "transform-occupant":
      if (effect.cellIds?.[0] && effect.occupant) {
        getCell(runtime.board, effect.cellIds[0]).occupant = effect.occupant;
        events.push({ kind: "occupant-change", description: `occupant ${effect.cellIds[0]}`, cellIds: effect.cellIds });
      }
      break;
    case "move-occupant":
      if (effect.from && effect.to) {
        const source = getCell(runtime.board, effect.from);
        const dest = getCell(runtime.board, effect.to);
        dest.occupant = source.occupant;
        source.occupant = { type: "empty" };
        events.push({ kind: "occupant-change", description: `move ${effect.from} → ${effect.to}`, cellIds: [effect.from, effect.to] });
      }
      break;
    case "swap-occupants":
      if (effect.from && effect.to) {
        const a = getCell(runtime.board, effect.from);
        const b = getCell(runtime.board, effect.to);
        const hold = a.occupant;
        a.occupant = b.occupant;
        b.occupant = hold;
        events.push({ kind: "occupant-change", description: `swap ${effect.from} ↔ ${effect.to}`, cellIds: [effect.from, effect.to] });
      }
      break;
    case "rotate-occupants":
      if (effect.cycle && effect.cycle.length > 1) {
        const occupants = effect.cycle.map((id) => getCell(runtime.board, id).occupant);
        for (let index = 0; index < effect.cycle.length; index += 1) {
          const next = occupants[(index + effect.cycle.length - 1) % effect.cycle.length]!;
          getCell(runtime.board, effect.cycle[index]!).occupant = next;
        }
        events.push({ kind: "occupant-change", description: `rotate ${effect.cycle.join("→")}`, cellIds: effect.cycle });
      }
      break;
    case "mark-occupant":
      if (effect.cellIds?.[0] && effect.mark) {
        const marks = runtime.occupants[effect.cellIds[0]] ?? { marks: {} };
        marks.marks[effect.mark] = effect.markValue ?? "true";
        if (effect.mark === "identity") {
          marks.identity = effect.markValue;
        }
        runtime.occupants[effect.cellIds[0]] = marks;
        events.push({ kind: "occupant-change", description: `mark ${effect.cellIds[0]}.${effect.mark}`, cellIds: effect.cellIds });
      }
      break;
    case "change-edge-state":
    case "enable-edge":
    case "disable-edge":
    case "open-route":
    case "close-route":
    case "redirect-edge":
    case "activate-portal":
    case "deactivate-portal":
      applyEdgeEffect(runtime, effect, events);
      break;
    case "create-temporary":
      if (effect.temporary) {
        runtime.temporary[effect.temporary.id] = effect.temporary;
        events.push({ kind: "board-state-change", description: `temporary ${effect.temporary.id}` });
      }
      break;
    case "remove-temporary":
      if (effect.temporaryId) {
        delete runtime.temporary[effect.temporaryId];
        events.push({ kind: "board-state-change", description: `removed temporary ${effect.temporaryId}` });
      }
      break;
    case "modify-objective":
      if (effect.objectiveKey) {
        runtime.counters.objective[effect.objectiveKey] =
          (runtime.counters.objective[effect.objectiveKey] ?? 0) + (effect.objectiveDelta ?? 0);
        events.push({ kind: "objective-progress", description: `${effect.objectiveKey}=${runtime.counters.objective[effect.objectiveKey]}` });
      }
      break;
    case "advance-threshold":
      if (effect.thresholdId) {
        const record = runtime.thresholds[effect.thresholdId] ?? {
          id: effect.thresholdId,
          kind: "count" as const,
          target: 1,
          current: 0,
          crossed: false,
        };
        record.current += effect.thresholdDelta ?? 1;
        const wasCrossed = record.crossed;
        record.crossed = record.current >= record.target;
        runtime.thresholds[effect.thresholdId] = record;
        events.push({ kind: "board-state-change", description: `threshold ${record.id}=${record.current}` });
        if (record.crossed && !wasCrossed) {
          events.push({ kind: "threshold-reached", description: `threshold ${record.id} crossed` });
        }
      }
      break;
    case "upsert-relationship":
      if (effect.relationship) {
        runtime.relationships[effect.relationship.id] = effect.relationship;
        events.push({ kind: "board-state-change", description: `link ${effect.relationship.id}` });
      }
      break;
    case "remove-relationship":
      if (effect.relationshipId) {
        delete runtime.relationships[effect.relationshipId];
        events.push({ kind: "board-state-change", description: `unlink ${effect.relationshipId}` });
      }
      break;
    case "sync-members":
      if (effect.syncId && effect.cellState && effect.cellIds) {
        for (const cellId of effect.cellIds) {
          setCellState(runtime, cellId, effect.cellState);
        }
        events.push({ kind: "cell-change", description: `sync ${effect.syncId}`, cellIds: effect.cellIds });
      }
      break;
    case "emit-discovery":
      events.push({ kind: "discovery", description: effect.discoveryId ?? "discovery" });
      break;
    case "presentation-cue":
      events.push({ kind: "presentation", description: effect.cue?.announcement ?? "cue" });
      break;
    default:
      break;
  }
}

function applyEdgeEffect(runtime: PrimitiveRuntime, effect: PrimitiveEffect, events: PrimitiveEvent[]): void {
  const key = effect.edgeKey;
  if (!key) {
    return;
  }
  const current = { ...edgeOverlay(runtime, key) };
  if (effect.kind === "disable-edge" || effect.kind === "deactivate-portal") {
    current.active = false;
  }
  if (effect.kind === "enable-edge" || effect.kind === "activate-portal") {
    current.active = true;
  }
  if (effect.kind === "close-route") {
    current.traversable = false;
  }
  if (effect.kind === "open-route") {
    current.traversable = true;
  }
  if (effect.kind === "redirect-edge" && effect.redirectTo) {
    current.redirectedTo = effect.redirectTo;
  }
  if (effect.edgePatch) {
    if (effect.edgePatch.allowsMatch !== undefined) {
      current.allowsMatch = effect.edgePatch.allowsMatch;
    }
    if (effect.edgePatch.allowsSwap !== undefined) {
      current.allowsSwap = effect.edgePatch.allowsSwap;
    }
    if (effect.edgePatch.active !== undefined) {
      current.active = effect.edgePatch.active;
    }
    if (effect.edgePatch.traversable !== undefined) {
      current.traversable = effect.edgePatch.traversable;
    }
    if (effect.edgePatch.redirectedTo !== undefined) {
      current.redirectedTo = effect.edgePatch.redirectedTo;
    }
  }
  runtime.edges[key] = current;
  writeEdgeToBoard(runtime, key, current);
  events.push({ kind: "board-state-change", description: `${effect.kind} ${key}`, edgeKeys: [key] });
}

function writeEdgeToBoard(runtime: PrimitiveRuntime, key: string, overlay: EdgeOverlay): void {
  const parsed = parseEdgeKey(key);
  if (!parsed) {
    return;
  }
  const list = runtime.board.topology.directed[parsed.from] ?? [];
  const entry = list.find((edge) => edge.to === parsed.to);
  if (!entry) {
    return;
  }
  entry.allowsMatch = overlay.allowsMatch;
  entry.allowsSwap = overlay.allowsSwap;
  if (overlay.redirectedTo && overlay.redirectedTo !== entry.to) {
    const adjacency = runtime.board.topology.adjacency[parsed.from] ?? [];
    runtime.board.topology.adjacency[parsed.from] = adjacency.map((id) => (id === entry.to ? overlay.redirectedTo! : id));
    entry.to = overlay.redirectedTo;
  }
}

function setCellState(runtime: PrimitiveRuntime, cellId: string, state: CellPrimitiveState): void {
  const overlay = runtime.cells[cellId] ?? { named: ["normal"], custom: [] };
  const named = new Set<CellPrimitiveState>(overlay.named.filter((item) => item !== "normal"));
  const opposites: Record<string, CellPrimitiveState> = {
    locked: "unlocked",
    unlocked: "locked",
    active: "inactive",
    inactive: "active",
    revealed: "hidden",
    hidden: "revealed",
    protected: "vulnerable",
    vulnerable: "protected",
  };
  const opposite = opposites[state];
  if (opposite) {
    named.delete(opposite);
  }
  named.add(state);
  runtime.cells[cellId] = { named: [...named], custom: overlay.custom };
  const flags = getCell(runtime.board, cellId).flags;
  if (state === "active") {
    flags.active = true;
  }
  if (state === "inactive") {
    flags.active = false;
  }
  if (state === "hidden") {
    flags.hidden = true;
  }
  if (state === "revealed") {
    flags.hidden = false;
  }
  if (state === "protected") {
    flags.protected = true;
  }
  if (state === "vulnerable") {
    flags.protected = false;
  }
  if (state === "frozen") {
    flags.frozen = true;
  }
}

function validateRuntimeGraph(runtime: PrimitiveRuntime): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set(runtime.board.topology.cellIds);
  if (ids.size === 0) {
    issues.push(issue("primitive.orphan_board", "board", "Primitive batch left the board with no cells."));
  }
  for (const [from, entries] of Object.entries(runtime.board.topology.directed)) {
    if (!ids.has(from)) {
      issues.push(issue("primitive.orphan_from", `edges.${from}`, `Directed list references missing cell "${from}".`));
    }
    for (const entry of entries) {
      if (!ids.has(entry.to)) {
        issues.push(issue("primitive.orphan_to", `edges.${from}`, `Edge points at missing cell "${entry.to}".`));
      }
      if (from === entry.to) {
        issues.push(issue("primitive.self_edge", `edges.${graphEdgeKey(from, entry.to)}`, "Self-edges are invalid."));
      }
    }
  }
  for (const key of Object.keys(runtime.edges)) {
    const parsed = parseEdgeKey(key);
    if (!parsed || !ids.has(parsed.from) || !ids.has(parsed.to)) {
      issues.push(issue("primitive.invalid_edge_id", `edges.${key}`, `Edge overlay "${key}" has an invalid endpoint.`));
    }
  }
  const seenLinks = new Set<string>();
  for (const link of Object.values(runtime.relationships)) {
    const signature = `${link.kind}:${[link.a, link.b].sort().join(":")}`;
    if (seenLinks.has(signature)) {
      issues.push(issue("primitive.duplicate_relationship", `relationships.${link.id}`, "Duplicate relationship endpoints."));
    }
    seenLinks.add(signature);
  }
  return issues;
}

function explainBatch(effects: PrimitiveEffect[], events: PrimitiveEvent[]): PrimitiveExplanation {
  const changedCells = [...new Set(effects.flatMap((effect) => effect.cellIds ?? [effect.from, effect.to, ...(effect.cycle ?? [])].filter(Boolean) as string[]))];
  const changedEdges = [...new Set(effects.map((effect) => effect.edgeKey).filter(Boolean) as string[])];
  return {
    what: `Applied ${effects.length} primitive effect(s)`,
    why: events.map((event) => event.description).join("; ") || "No events",
    changedCells,
    changedEdges,
    effects,
    events,
  };
}

export { defaultEdgeOverlay };

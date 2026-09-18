import { issue, type ValidationIssue } from "../validation.js";
import { connectedComponents, connectivityRequired, findCycleUndirected, adjacencyMap } from "./components.js";
import { findDirectedCycle } from "./cycles.js";
import { resolveTraversal } from "./direction.js";
import type { BoardDefinition, EdgeKind } from "./types.js";

const EDGE_KINDS = new Set<EdgeKind>(["adjacent", "portal", "bridge"]);
const FLOW_KINDS = new Set(["gravity", "portal", "branch", "teleport"]);
const TRAVERSALS = new Set(["both", "forward"]);

export interface BoardValidationOptions {
  /** When provided, cell.initialIcon values must exist in this set. */
  knownIconIds?: Iterable<string>;
}

/**
 * Designer-facing board validation. Collects every issue so authors can fix
 * a document without chasing one error at a time. Never silently repairs.
 */
export function validateBoardDefinition(
  definition: BoardDefinition,
  options?: BoardValidationOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, number>();

  if (definition.cells.length === 0) {
    issues.push(issue("board.no_cells", "cells", "A board needs at least one playable cell."));
    return issues;
  }

  for (const [index, cell] of definition.cells.entries()) {
    const path = `cells[${index}]`;
    if (!cell.id) {
      issues.push(issue("cell.empty_id", path, "Cell id is required."));
      continue;
    }
    const prior = ids.get(cell.id);
    if (prior !== undefined) {
      issues.push(
        issue(
          "cell.duplicate_id",
          `${path}.id`,
          `Duplicate cell id "${cell.id}" (also cells[${prior}]). Each cell needs a unique id.`,
        ),
      );
    } else {
      ids.set(cell.id, index);
    }
    if (cell.position && (!Number.isFinite(cell.position.x) || !Number.isFinite(cell.position.y))) {
      issues.push(
        issue(
          "cell.invalid_position",
          `${path}.position`,
          `Cell "${cell.id}" has a non-finite presentation position. Coordinates are layout-only, but they must still be numbers.`,
        ),
      );
    }
  }

  const known = new Set(ids.keys());
  const knownIcons = options?.knownIconIds ? new Set(options.knownIconIds) : null;

  const checkRef = (cellId: string, path: string, code: string, what: string) => {
    if (!known.has(cellId)) {
      issues.push(
        issue(code, path, `${what} references unknown cell "${cellId}". Check the id for typos.`),
      );
    }
  };

  if (knownIcons) {
    for (const [index, cell] of definition.cells.entries()) {
      if (cell.initialIcon && !knownIcons.has(cell.initialIcon)) {
        issues.push(
          issue(
            "cell.unknown_icon",
            `cells[${index}].initialIcon`,
            `Cell "${cell.id}" references unknown icon "${cell.initialIcon}".`,
          ),
        );
      }
    }
  }

  const edgeKeys = new Map<string, number>();
  for (const [index, edge] of definition.adjacency.entries()) {
    const path = `adjacency[${index}]`;
    checkRef(edge.from, `${path}.from`, "edge.unknown_from", "Connection");
    checkRef(edge.to, `${path}.to`, "edge.unknown_to", "Connection");
    if (edge.from === edge.to) {
      issues.push(issue("edge.self", path, `Cell "${edge.from}" cannot connect to itself.`));
    }
    if (edge.kind && !EDGE_KINDS.has(edge.kind)) {
      issues.push(
        issue("edge.invalid_kind", `${path}.kind`, `Edge "${edge.from} → ${edge.to}" has invalid kind "${String(edge.kind)}".`),
      );
    }
    if (edge.direction !== undefined && edge.direction.trim().length === 0) {
      issues.push(
        issue(
          "edge.invalid_direction",
          `${path}.direction`,
          `Edge "${edge.from} → ${edge.to}" has an empty direction label. Omit the field or provide authored vocabulary.`,
        ),
      );
    }
    if (edge.orientation !== undefined && edge.orientation.trim().length === 0) {
      issues.push(
        issue(
          "edge.invalid_orientation",
          `${path}.orientation`,
          `Edge "${edge.from} → ${edge.to}" has an empty orientation.`,
        ),
      );
    }
    if (edge.traversal && !TRAVERSALS.has(edge.traversal)) {
      issues.push(
        issue(
          "edge.invalid_traversal",
          `${path}.traversal`,
          `Edge "${edge.from} → ${edge.to}" has invalid traversal "${String(edge.traversal)}". Use "both" or "forward".`,
        ),
      );
    }
    if (edge.traversal && edge.bidirectional !== undefined) {
      const implied = edge.bidirectional ? "both" : "forward";
      if (implied !== edge.traversal) {
        issues.push(
          issue(
            "edge.traversal_conflict",
            path,
            `Edge "${edge.from} → ${edge.to}" sets traversal "${edge.traversal}" but bidirectional=${edge.bidirectional}.`,
          ),
        );
      }
    }
    const key = `${edge.from}→${edge.to}:${edge.kind ?? "adjacent"}`;
    const prior = edgeKeys.get(key);
    if (prior !== undefined) {
      issues.push(
        issue("edge.duplicate", path, `Duplicate connection "${edge.from} → ${edge.to}" (also adjacency[${prior}]).`),
      );
    } else {
      edgeKeys.set(key, index);
    }
    void resolveTraversal(edge);
  }

  const outgoingDirections = new Map<string, Map<string, number>>();
  for (const [index, edge] of definition.adjacency.entries()) {
    if (!edge.direction || !known.has(edge.from)) {
      continue;
    }
    const byDir = outgoingDirections.get(edge.from) ?? new Map<string, number>();
    const prior = byDir.get(edge.direction);
    if (prior !== undefined) {
      issues.push(
        issue(
          "edge.duplicate_direction",
          `adjacency[${index}].direction`,
          `Cell "${edge.from}" already has an outgoing direction "${edge.direction}" (adjacency[${prior}]). Pattern walks would be ambiguous.`,
          "warning",
        ),
      );
    } else {
      byDir.set(edge.direction, index);
    }
    outgoingDirections.set(edge.from, byDir);
  }

  const portalIds = new Map<string, number>();
  const portalPairs = new Map<string, number>();
  for (const [index, portal] of (definition.portals ?? []).entries()) {
    const path = `portals[${index}]`;
    const missingFrom = known.has(portal.from) ? null : portal.from;
    const missingTo = known.has(portal.to) ? null : portal.to;
    if (missingFrom) {
      issues.push(
        issue(
          "portal.unknown_from",
          `${path}.from`,
          `portal "${portal.id}" (${portal.from} → ${portal.to}) references missing cell "${missingFrom}".`,
        ),
      );
    }
    if (missingTo) {
      issues.push(
        issue(
          "portal.unknown_to",
          `${path}.to`,
          `portal "${portal.id}" (${portal.from} → ${portal.to}) references missing cell "${missingTo}".`,
        ),
      );
    }
    if (portal.from === portal.to) {
      issues.push(issue("portal.self", path, `Portal "${portal.id}" cannot link a cell to itself.`));
    }
    const prior = portalIds.get(portal.id);
    if (prior !== undefined) {
      issues.push(issue("portal.duplicate_id", `${path}.id`, `Duplicate portal id "${portal.id}".`));
    } else {
      portalIds.set(portal.id, index);
    }
    const pairKey = [portal.from, portal.to].sort().join("↔");
    const priorPair = portalPairs.get(pairKey);
    if (priorPair !== undefined) {
      issues.push(
        issue(
          "portal.duplicate_relationship",
          path,
          `Duplicate portal relationship between "${portal.from}" and "${portal.to}" (also portals[${priorPair}]).`,
        ),
      );
    } else {
      portalPairs.set(pairKey, index);
    }
  }

  for (const [index, edge] of (definition.flow ?? []).entries()) {
    const path = `flow[${index}]`;
    const missing = !known.has(edge.from) ? edge.from : !known.has(edge.to) ? edge.to : null;
    if (missing) {
      issues.push(
        issue(
          missing === edge.from ? "flow.unknown_from" : "flow.unknown_to",
          missing === edge.from ? `${path}.from` : `${path}.to`,
          `flow edge "${edge.from} → ${edge.to}" references missing cell "${missing}".`,
        ),
      );
    } else {
      checkRef(edge.from, `${path}.from`, "flow.unknown_from", "Flow edge");
      checkRef(edge.to, `${path}.to`, "flow.unknown_to", "Flow edge");
    }
    if (edge.from === edge.to) {
      issues.push(
        issue("flow.self", path, `flow edge "${edge.from} → ${edge.to}" targets its own cell. Settlement would loop.`),
      );
    }
    if (edge.kind && !FLOW_KINDS.has(edge.kind)) {
      issues.push(
        issue(
          "flow.invalid_kind",
          `${path}.kind`,
          `flow edge "${edge.from} → ${edge.to}" has invalid kind "${String(edge.kind)}".`,
        ),
      );
    }
  }

  const flowDown: Record<string, string[]> = {};
  for (const id of known) {
    flowDown[id] = [];
  }
  for (const edge of definition.flow ?? []) {
    if (known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to) {
      flowDown[edge.from]?.push(edge.to);
    }
  }
  const flowCycle = findDirectedCycle(flowDown);
  if (flowCycle) {
    issues.push(
      issue(
        "flow.cycle",
        "flow",
        `flow graph contains a cycle: ${flowCycle.join(" → ")}. Cascades would not terminate.`,
      ),
    );
  }

  if (definition.movement?.mode === "along-flow" && (definition.flow ?? []).length === 0) {
    issues.push(
      issue("movement.flow_missing", "movement", 'Movement mode "along-flow" requires flow edges (from → to).'),
    );
  }

  for (const [index, source] of (definition.movement?.refill.sourceCellIds ?? []).entries()) {
    checkRef(source, `movement.refill.sourceCellIds[${index}]`, "movement.unknown_source", "Refill source");
  }

  const sectionIds = new Set<string>();
  for (const [index, section] of (definition.sections ?? []).entries()) {
    const path = `sections[${index}]`;
    if (sectionIds.has(section.id)) {
      issues.push(issue("section.duplicate_id", `${path}.id`, `Duplicate section id "${section.id}".`));
    }
    sectionIds.add(section.id);
    const inSection = new Set(section.cellIds);
    for (const cellId of section.cellIds) {
      checkRef(cellId, path, "section.unknown_cell", `Section "${section.id}"`);
    }
    issues.push(...validateRotation(section, inSection, known, path));
  }

  for (const [index, cell] of definition.cells.entries()) {
    if (cell.sectionId && !sectionIds.has(cell.sectionId) && (definition.sections ?? []).length > 0) {
      issues.push(
        issue(
          "cell.unknown_section",
          `cells[${index}].sectionId`,
          `Cell "${cell.id}" references unknown section "${cell.sectionId}".`,
        ),
      );
    }
  }

  if (definition.cells.length > 1 && definition.adjacency.length === 0 && (definition.portals ?? []).length === 0) {
    issues.push(
      issue(
        "board.no_connections",
        "adjacency",
        "This board has multiple cells but no connections or portals. Matching and swapping need graph edges.",
      ),
    );
  }

  const components = connectedComponents(definition);
  if (connectivityRequired(definition) && components.length > 1) {
    issues.push(
      issue(
        "board.unreachable",
        "adjacency",
        `Connectivity is required, but the graph has ${components.length} regions: ${components
          .map((component) => `[${component.cellIds.join(", ")}]`)
          .join("; ")}. Add connections/portals, or set topology.connectivity to "optional".`,
      ),
    );
  }

  const isolated = definition.cells
    .map((cell) => cell.id)
    .filter((id) => (adjacencyMap(definition).get(id)?.size ?? 0) === 0);
  if (isolated.length > 0 && definition.cells.length > 1) {
    const severity = connectivityRequired(definition) ? "error" : "warning";
    issues.push(
      issue(
        "board.isolated_cells",
        "adjacency",
        `These cells have no neighbors: ${isolated.join(", ")}. They cannot swap or match with anything.`,
        severity,
      ),
    );
  }

  issues.push(...validateTopologyShapeHints(definition, components));
  return issues;
}

function validateRotation(
  section: NonNullable<BoardDefinition["sections"]>[number],
  inSection: Set<string>,
  known: Set<string>,
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const spec = section.rotation;
  if (!spec) {
    return issues;
  }
  if (!Number.isFinite(spec.incrementDegrees)) {
    issues.push(
      issue(
        "rotation.invalid_increment",
        `${path}.rotation.incrementDegrees`,
        `Section "${section.id}" rotation increment must be a finite number of degrees (presentation metadata).`,
      ),
    );
  }
  if (spec.rotatable && spec.incrementDegrees === 0) {
    issues.push(
      issue(
        "rotation.zero_increment",
        `${path}.rotation.incrementDegrees`,
        `Section "${section.id}" is rotatable but incrementDegrees is 0.`,
        "warning",
      ),
    );
  }
  const seenInCycles = new Set<string>();
  for (const [cycleIndex, cycle] of (spec.occupantCycles ?? []).entries()) {
    if (cycle.length < 2) {
      issues.push(
        issue(
          "rotation.cycle_too_short",
          `${path}.rotation.occupantCycles[${cycleIndex}]`,
          `Section "${section.id}" occupant cycle must list at least two cells.`,
        ),
      );
    }
    const unique = new Set<string>();
    for (const cellId of cycle) {
      if (!known.has(cellId)) {
        issues.push(
          issue(
            "rotation.unknown_cell",
            `${path}.rotation.occupantCycles[${cycleIndex}]`,
            `Section "${section.id}" rotation cycle references missing cell "${cellId}".`,
          ),
        );
      } else if (!inSection.has(cellId)) {
        issues.push(
          issue(
            "rotation.cell_outside_section",
            `${path}.rotation.occupantCycles[${cycleIndex}]`,
            `Section "${section.id}" rotation cycle includes "${cellId}", which is not in this section.`,
          ),
        );
      }
      if (unique.has(cellId)) {
        issues.push(
          issue(
            "rotation.cycle_duplicate_cell",
            `${path}.rotation.occupantCycles[${cycleIndex}]`,
            `Section "${section.id}" occupant cycle repeats cell "${cellId}".`,
          ),
        );
      }
      unique.add(cellId);
      if (seenInCycles.has(cellId)) {
        issues.push(
          issue(
            "rotation.overlapping_cycles",
            `${path}.rotation.occupantCycles[${cycleIndex}]`,
            `Cell "${cellId}" appears in more than one occupant cycle of section "${section.id}".`,
          ),
        );
      }
      seenInCycles.add(cellId);
    }
  }
  if (spec.remapDirections && spec.directionMap) {
    for (const [from, to] of Object.entries(spec.directionMap)) {
      if (!from || !to) {
        issues.push(
          issue(
            "rotation.invalid_direction_map",
            `${path}.rotation.directionMap`,
            `Section "${section.id}" directionMap has an empty key or value.`,
          ),
        );
      }
    }
  }
  return issues;
}

function validateTopologyShapeHints(
  definition: BoardDefinition,
  components: { cellIds: string[] }[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const kind = definition.topology.kind;
  const adjacency = adjacencyMap(definition);

  if (!kind) {
    issues.push(issue("topology.missing_kind", "topology.kind", "Topology metadata is missing a kind label."));
  }

  if (kind === "circular" && !findCycleUndirected(adjacency)) {
    issues.push(
      issue(
        "topology.circular_no_cycle",
        "topology.kind",
        'Topology is labeled "circular" but the graph has no cycle. This is a hint mismatch, not an engine failure.',
        "warning",
      ),
    );
  }

  if (kind === "portal-connected" && (definition.portals ?? []).length === 0) {
    issues.push(
      issue(
        "topology.portal_missing",
        "portals",
        'Topology is labeled "portal-connected" but no portals are defined.',
      ),
    );
  }

  if (kind === "hub-and-spoke") {
    const hub = [...adjacency.entries()].some(([, neighbors]) => neighbors.size >= 3);
    if (!hub) {
      issues.push(
        issue(
          "topology.hub_missing",
          "topology.kind",
          'Topology is labeled "hub-and-spoke" but no cell has 3+ neighbors.',
          "warning",
        ),
      );
    }
  }

  if ((kind === "multi-chamber" || kind === "twin-path") && components.length < 2 && (definition.portals ?? []).length === 0) {
    issues.push(
      issue(
        "topology.chamber_hint",
        "topology.kind",
        `Topology is labeled "${kind}" but the graph is a single region without portals. Chambers should be authored as regions + bridges/portals.`,
        "warning",
      ),
    );
  }

  if (kind === "rotating") {
    const rotatable = (definition.sections ?? []).some((section) => section.rotation?.rotatable);
    if (!rotatable) {
      issues.push(
        issue(
          "topology.rotation_missing",
          "sections",
          'Topology is labeled "rotating" but no section declares rotation. Author occupantCycles on a rotatable section; the engine will not invent a spin from coordinates.',
          "warning",
        ),
      );
    }
  }

  return issues;
}

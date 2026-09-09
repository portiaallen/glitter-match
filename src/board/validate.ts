import { issue, type ValidationIssue } from "../validation.js";
import { connectedComponents, connectivityRequired, findCycleUndirected, adjacencyMap } from "./components.js";
import type { BoardDefinition } from "./types.js";

/**
 * Designer-facing board validation. Collects every issue so authors can fix
 * a document without chasing one error at a time.
 */
export function validateBoardDefinition(definition: BoardDefinition): ValidationIssue[] {
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
  }

  const known = new Set(ids.keys());

  const checkRef = (cellId: string, path: string, code: string, what: string) => {
    if (!known.has(cellId)) {
      issues.push(
        issue(code, path, `${what} references unknown cell "${cellId}". Check the id for typos.`),
      );
    }
  };

  for (const [index, edge] of definition.adjacency.entries()) {
    const path = `adjacency[${index}]`;
    checkRef(edge.from, `${path}.from`, "edge.unknown_from", "Connection");
    checkRef(edge.to, `${path}.to`, "edge.unknown_to", "Connection");
    if (edge.from === edge.to) {
      issues.push(
        issue("edge.self", path, `Cell "${edge.from}" cannot connect to itself.`),
      );
    }
  }

  const portalIds = new Map<string, number>();
  for (const [index, portal] of (definition.portals ?? []).entries()) {
    const path = `portals[${index}]`;
    checkRef(portal.from, `${path}.from`, "portal.unknown_from", "Portal");
    checkRef(portal.to, `${path}.to`, "portal.unknown_to", "Portal");
    if (portal.from === portal.to) {
      issues.push(issue("portal.self", path, `Portal "${portal.id}" cannot link a cell to itself.`));
    }
    const prior = portalIds.get(portal.id);
    if (prior !== undefined) {
      issues.push(issue("portal.duplicate_id", `${path}.id`, `Duplicate portal id "${portal.id}".`));
    } else {
      portalIds.set(portal.id, index);
    }
  }

  for (const [index, edge] of (definition.flow ?? []).entries()) {
    const path = `flow[${index}]`;
    checkRef(edge.from, `${path}.from`, "flow.unknown_from", "Flow edge");
    checkRef(edge.to, `${path}.to`, "flow.unknown_to", "Flow edge");
    if (edge.from === edge.to) {
      issues.push(issue("flow.self", path, "A flow edge cannot target its own cell. Settlement would loop."));
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
        `Movement flow must be a DAG so cascades terminate. Cycle: ${flowCycle.join(" -> ")}.`,
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
    for (const cellId of section.cellIds) {
      checkRef(cellId, path, "section.unknown_cell", `Section "${section.id}"`);
    }
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

function validateTopologyShapeHints(
  definition: BoardDefinition,
  components: { cellIds: string[] }[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const kind = definition.topology.kind;
  const adjacency = adjacencyMap(definition);

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
          'Topology is labeled "rotating" but no section declares rotation. Rotation gameplay is not implemented yet; this is authoring metadata.',
          "warning",
        ),
      );
    }
  }

  return issues;
}

function findDirectedCycle(graph: Record<string, string[]>): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const dfs = (node: string): string[] | null => {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (visited.has(node)) {
      return null;
    }
    visiting.add(node);
    stack.push(node);
    for (const next of graph[node] ?? []) {
      const cycle = dfs(next);
      if (cycle) {
        return cycle;
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };

  for (const node of Object.keys(graph)) {
    const cycle = dfs(node);
    if (cycle) {
      return cycle;
    }
  }
  return null;
}

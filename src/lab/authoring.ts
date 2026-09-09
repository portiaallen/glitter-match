import type { CellId } from "../ids.js";
import {
  compileBoardDocument,
  parseBoardDocument,
  serializeBoardDefinition,
  type BoardDocument,
  type BoardDefinition,
  type CellDefinition,
  type EdgeDefinition,
  type FlowEdgeDefinition,
  type PortalDefinition,
} from "../board/index.js";
import { validateBoardDefinition } from "../board/validate.js";
import type { EdgeKind, EdgeTraversal, FlowKind } from "../board/types.js";
import { errorsOnly, type ValidationIssue } from "../validation.js";

export interface AuthoringEdgeSemantics {
  direction?: string;
  orientation?: string;
  label?: string;
  traversal?: EdgeTraversal;
  bidirectional?: boolean;
  kind?: EdgeKind;
  allowsMatch?: boolean;
  allowsSwap?: boolean;
}

export interface AuthoringActionResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/**
 * In-memory graph authoring session for the Board Laboratory.
 * This is a visual editor for an explicit graph. It never implies a grid
 * and never auto-connects nearby cells unless `connectNearby` is invoked.
 */
export class GraphAuthoringSession {
  draft: BoardDocument;
  private cellSerial = 1;
  private portalSerial = 1;

  constructor(document?: BoardDocument) {
    this.draft = document ? structuredClone(document) : blankDocument();
    this.syncSerials();
  }

  static blank(): GraphAuthoringSession {
    return new GraphAuthoringSession();
  }

  static fromDocument(document: BoardDocument): GraphAuthoringSession {
    return new GraphAuthoringSession(document);
  }

  static fromJson(input: string | unknown): GraphAuthoringSession {
    const raw = typeof input === "string" ? JSON.parse(input) : input;
    return new GraphAuthoringSession(parseBoardDocument(raw));
  }

  connections(): EdgeDefinition[] {
    return this.draft.connections ?? this.draft.adjacency ?? [];
  }

  cells(): CellDefinition[] {
    return this.draft.cells;
  }

  flow(): FlowEdgeDefinition[] {
    return this.draft.flow ?? [];
  }

  portals(): PortalDefinition[] {
    return this.draft.portals ?? [];
  }

  addCell(partial?: Partial<CellDefinition>): CellId {
    const id = partial?.id ?? this.nextCellId();
    if (this.draft.cells.some((cell) => cell.id === id)) {
      throw new Error(`Cell id "${id}" already exists.`);
    }
    const position = partial?.position ?? this.defaultPosition();
    this.draft.cells.push({
      id,
      position: { ...position },
      active: partial?.active,
      terrain: partial?.terrain,
      hidden: partial?.hidden,
      protected: partial?.protected,
      frozen: partial?.frozen,
      tags: partial?.tags,
      sectionId: partial?.sectionId,
      initialIcon: partial?.initialIcon,
      initialObstacles: partial?.initialObstacles,
    });
    return id;
  }

  deleteCell(id: CellId): void {
    this.draft.cells = this.draft.cells.filter((cell) => cell.id !== id);
    this.draft.connections = this.connections().filter((edge) => edge.from !== id && edge.to !== id);
    this.draft.adjacency = undefined;
    this.draft.flow = this.flow().filter((edge) => edge.from !== id && edge.to !== id);
    this.draft.portals = this.portals().filter((portal) => portal.from !== id && portal.to !== id);
    if (this.draft.sections) {
      this.draft.sections = this.draft.sections.map((section) => ({
        ...section,
        cellIds: section.cellIds.filter((cellId) => cellId !== id),
      }));
    }
  }

  moveCell(id: CellId, x: number, y: number, snapSize?: number): void {
    const cell = this.requireCell(id);
    const position = snapSize && snapSize > 0 ? snapPosition(x, y, snapSize) : { x, y };
    cell.position = { ...cell.position, ...position };
  }

  renameCell(from: CellId, to: CellId): void {
    if (from === to) {
      return;
    }
    if (this.draft.cells.some((cell) => cell.id === to)) {
      throw new Error(`Cell id "${to}" already exists.`);
    }
    this.requireCell(from).id = to;
    const rewrite = (id: string) => (id === from ? to : id);
    this.draft.connections = this.connections().map((edge) => ({
      ...edge,
      from: rewrite(edge.from),
      to: rewrite(edge.to),
    }));
    this.draft.adjacency = undefined;
    this.draft.flow = this.flow().map((edge) => ({ ...edge, from: rewrite(edge.from), to: rewrite(edge.to) }));
    this.draft.portals = this.portals().map((portal) => ({
      ...portal,
      from: rewrite(portal.from),
      to: rewrite(portal.to),
    }));
    if (this.draft.sections) {
      this.draft.sections = this.draft.sections.map((section) => ({
        ...section,
        cellIds: section.cellIds.map(rewrite),
      }));
    }
  }

  setCellMetadata(id: CellId, patch: Partial<Omit<CellDefinition, "id" | "position">>): void {
    Object.assign(this.requireCell(id), patch);
  }

  addEdge(from: CellId, to: CellId, semantics: AuthoringEdgeSemantics = {}): EdgeDefinition {
    this.requireCell(from);
    this.requireCell(to);
    const edge: EdgeDefinition = { from, to, ...semantics };
    this.draft.connections = [...this.connections(), edge];
    this.draft.adjacency = undefined;
    return edge;
  }

  deleteEdge(from: CellId, to: CellId, kind?: EdgeKind): void {
    this.draft.connections = this.connections().filter((edge) => {
      if (kind && (edge.kind ?? "adjacent") !== kind) {
        return true;
      }
      const same = edge.from === from && edge.to === to;
      const reverse = (edge.traversal ?? (edge.bidirectional === false ? "forward" : "both")) === "both" && edge.from === to && edge.to === from;
      return !same && !reverse;
    });
    this.draft.adjacency = undefined;
  }

  setEdgeSemantics(from: CellId, to: CellId, semantics: AuthoringEdgeSemantics): void {
    const edge = this.connections().find(
      (item) => (item.from === from && item.to === to) || (item.from === to && item.to === from),
    );
    if (!edge) {
      throw new Error(`No authored edge between "${from}" and "${to}".`);
    }
    Object.assign(edge, semantics);
  }

  addFlow(from: CellId, to: CellId, kind?: FlowKind, label?: string): FlowEdgeDefinition {
    this.requireCell(from);
    this.requireCell(to);
    const edge: FlowEdgeDefinition = { from, to, kind, label };
    this.draft.flow = [...this.flow(), edge];
    return edge;
  }

  removeFlow(from: CellId, to: CellId): void {
    this.draft.flow = this.flow().filter((edge) => !(edge.from === from && edge.to === to));
  }

  addPortal(
    from: CellId,
    to: CellId,
    options?: { id?: string; bidirectional?: boolean; conductsMatches?: boolean; allowsSwap?: boolean },
  ): PortalDefinition {
    this.requireCell(from);
    this.requireCell(to);
    const portal: PortalDefinition = {
      id: options?.id ?? this.nextPortalId(),
      from,
      to,
      bidirectional: options?.bidirectional,
      conductsMatches: options?.conductsMatches,
      allowsSwap: options?.allowsSwap,
    };
    this.draft.portals = [...this.portals(), portal];
    return portal;
  }

  removePortal(id: string): void {
    this.draft.portals = this.portals().filter((portal) => portal.id !== id);
  }

  /**
   * Optional convenience. Creates real authored edges that remain inspectable.
   * Off by default — nearby cells are not connected just because they look close.
   */
  connectNearby(maxDistance: number, semantics: AuthoringEdgeSemantics = {}): EdgeDefinition[] {
    const created: EdgeDefinition[] = [];
    const cells = this.draft.cells;
    for (let i = 0; i < cells.length; i += 1) {
      for (let j = i + 1; j < cells.length; j += 1) {
        const a = cells[i]!;
        const b = cells[j]!;
        const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
        if (dist > maxDistance) {
          continue;
        }
        const exists = this.connections().some(
          (edge) =>
            (edge.from === a.id && edge.to === b.id) || (edge.from === b.id && edge.to === a.id),
        );
        if (exists) {
          continue;
        }
        created.push(this.addEdge(a.id, b.id, semantics));
      }
    }
    return created;
  }

  validate(knownIconIds?: Iterable<string>): ValidationIssue[] {
    return validateBoardDefinition(this.toDefinition(), { knownIconIds });
  }

  exportDocument(): BoardDocument {
    return structuredClone({
      ...this.draft,
      connections: this.connections(),
      adjacency: undefined,
    });
  }

  exportDefinition(): BoardDefinition {
    return compileBoardDocument(this.exportDocument());
  }

  exportJson(): string {
    try {
      return serializeBoardDefinition(this.exportDefinition());
    } catch {
      return `${JSON.stringify(this.exportDocument(), null, 2)}\n`;
    }
  }

  importJson(input: string | unknown): void {
    const next = GraphAuthoringSession.fromJson(input);
    this.draft = next.draft;
    this.syncSerials();
  }

  compileResult(): AuthoringActionResult {
    const issues = this.validate();
    return { ok: errorsOnly(issues).length === 0, issues };
  }

  toDefinition(): BoardDefinition {
    const connections = this.connections();
    return {
      topology: this.draft.topology,
      cells: this.draft.cells,
      adjacency: connections,
      flow: this.draft.flow,
      portals: this.draft.portals,
      sections: this.draft.sections,
      movement: this.draft.movement,
      portalsConductMatches: this.draft.portalsConductMatches,
      portalsAllowSwap: this.draft.portalsAllowSwap,
    };
  }

  private requireCell(id: CellId): CellDefinition {
    const cell = this.draft.cells.find((item) => item.id === id);
    if (!cell) {
      throw new Error(`Unknown cell "${id}".`);
    }
    return cell;
  }

  private nextCellId(): CellId {
    let id = `cell_${this.cellSerial}`;
    while (this.draft.cells.some((cell) => cell.id === id)) {
      this.cellSerial += 1;
      id = `cell_${this.cellSerial}`;
    }
    this.cellSerial += 1;
    return id;
  }

  private nextPortalId(): string {
    let id = `portal_${this.portalSerial}`;
    while (this.portals().some((portal) => portal.id === id)) {
      this.portalSerial += 1;
      id = `portal_${this.portalSerial}`;
    }
    this.portalSerial += 1;
    return id;
  }

  private defaultPosition(): { x: number; y: number } {
    if (this.draft.cells.length === 0) {
      return { x: 0, y: 0 };
    }
    const maxX = Math.max(...this.draft.cells.map((cell) => cell.position.x));
    return { x: maxX + 1.5, y: 0 };
  }

  private syncSerials(): void {
    const cellNums = this.draft.cells
      .map((cell) => /^cell_(\d+)$/.exec(cell.id)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    this.cellSerial = cellNums.length > 0 ? Math.max(...cellNums) + 1 : 1;
    const portalNums = this.portals()
      .map((portal) => /^portal_(\d+)$/.exec(portal.id)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    this.portalSerial = portalNums.length > 0 ? Math.max(...portalNums) + 1 : 1;
  }
}

export function snapPosition(x: number, y: number, size: number): { x: number; y: number } {
  return {
    x: Math.round(x / size) * size,
    y: Math.round(y / size) * size,
  };
}

function blankDocument(): BoardDocument {
  return {
    id: "lab.untitled",
    status: "development",
    purpose: "engine-fixture",
    title: "Untitled graph",
    notes: "Graph authoring draft. Visual placement is not adjacency.",
    topology: { kind: "custom", notes: "authored graph", connectivity: "optional" },
    cells: [],
    connections: [],
  };
}

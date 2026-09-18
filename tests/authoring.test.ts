import { describe, expect, it } from "vitest";
import { GraphAuthoringSession, snapPosition } from "../src/lab/authoring.js";
import { compileBoardDocument, validateBoardDefinition } from "../src/board/index.js";
import { loadLabDocument } from "./helpers.js";

describe("graph authoring helper", () => {
  it("creates, moves, renames, and deletes cells without inventing a grid", () => {
    const session = GraphAuthoringSession.blank();
    const a = session.addCell({ id: "a", position: { x: 0, y: 0 } });
    const b = session.addCell({ id: "b", position: { x: 3, y: 1 } });
    expect(a).toBe("a");
    expect(session.cells().map((cell) => cell.id)).toEqual(["a", "b"]);
    session.moveCell("b", 8.2, 7.6);
    expect(session.cells().find((cell) => cell.id === "b")?.position).toEqual({ x: 8.2, y: 7.6 });
    session.renameCell("b", "tip");
    expect(session.cells().map((cell) => cell.id).sort()).toEqual(["a", "tip"]);
    session.deleteCell("tip");
    expect(session.cells()).toHaveLength(1);
  });

  it("creates and deletes authored edges with directional semantics", () => {
    const session = GraphAuthoringSession.blank();
    session.addCell({ id: "a", position: { x: 0, y: 0 } });
    session.addCell({ id: "b", position: { x: 1, y: 0 } });
    session.addEdge("a", "b", { direction: "along", traversal: "forward", orientation: "path" });
    expect(session.connections()[0]?.direction).toBe("along");
    session.setEdgeSemantics("a", "b", { allowsMatch: true, allowsSwap: false });
    expect(session.connections()[0]?.allowsSwap).toBe(false);
    session.deleteEdge("a", "b");
    expect(session.connections()).toEqual([]);
  });

  it("edits flow and portal relationships as distinct authoring kinds", () => {
    const session = GraphAuthoringSession.blank();
    session.addCell({ id: "a", position: { x: 0, y: 0 } });
    session.addCell({ id: "b", position: { x: 2, y: 2 } });
    session.addFlow("a", "b", "gravity", "down-the-path");
    session.addPortal("a", "b", { id: "gate" });
    expect(session.flow()[0]?.kind).toBe("gravity");
    expect(session.portals()[0]?.id).toBe("gate");
    session.removeFlow("a", "b");
    session.removePortal("gate");
    expect(session.flow()).toEqual([]);
    expect(session.portals()).toEqual([]);
  });

  it("imports and exports a laboratory board document", () => {
    const heart = loadLabDocument("lab.heart");
    const session = GraphAuthoringSession.fromDocument(heart);
    const exported = session.exportDocument();
    expect(exported.id).toBe("lab.heart");
    expect(exported.connections?.length).toBeGreaterThan(0);
    const compiled = session.exportDefinition();
    expect(compiled.cells).toHaveLength(heart.cells.length);
    const roundTrip = GraphAuthoringSession.fromJson(JSON.stringify(exported));
    expect(roundTrip.cells().map((cell) => cell.id)).toEqual(session.cells().map((cell) => cell.id));
  });

  it("surfaces validation issues for malformed drafts", () => {
    const session = GraphAuthoringSession.blank();
    session.addCell({ id: "a", position: { x: 0, y: 0 } });
    session.draft.flow = [{ from: "a", to: "ghost" }];
    const issues = session.validate();
    expect(issues.some((item) => item.message.includes('flow edge "a → ghost"'))).toBe(true);
  });

  it("optional nearby-connect writes real authored edges instead of a hidden grid", () => {
    const session = GraphAuthoringSession.blank();
    session.addCell({ id: "a", position: { x: 0, y: 0 } });
    session.addCell({ id: "b", position: { x: 0.5, y: 0 } });
    session.addCell({ id: "far", position: { x: 50, y: 0 } });
    const created = session.connectNearby(1);
    expect(created).toHaveLength(1);
    expect(session.connections()[0]).toMatchObject({ from: "a", to: "b" });
    expect(compileBoardDocument(session.exportDocument()).adjacency).toHaveLength(1);
  });

  it("keeps snapping as a visual placement aid", () => {
    expect(snapPosition(1.4, 1.6, 1)).toEqual({ x: 1, y: 2 });
  });

  it("does not treat blank drafts as secretly rectangular", () => {
    const session = GraphAuthoringSession.blank();
    session.addCell({ position: { x: 0, y: 0 } });
    session.addCell({ position: { x: 0, y: 1 } });
    expect(session.connections()).toEqual([]);
    expect(validateBoardDefinition(session.toDefinition()).some((item) => item.code === "board.no_connections" || item.code === "board.unreachable")).toBe(true);
  });
});

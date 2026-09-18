import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBoard } from "../src/board/index.js";
import { createProductionPack } from "../src/content/index.js";
import { GLITTER_ICON_ID, LAND_IDS } from "../src/ids.js";
import { createLandRegistry, createMechanicalVerbRegistry, validateLandDna } from "../src/lands/index.js";
import {
  compareMechanicState,
  composeMechanics,
  createDevEchoMechanic,
  createDevelopmentMechanicRegistry,
  createMechanicRegistry,
  createMechanicState,
  deserializeMechanicState,
  DEV_ECHO_MECHANIC_ID,
  dispatchMechanicPhase,
  MECHANIC_LIFECYCLE,
  normalizeMechanicBindings,
  reservedLandMechanicId,
  runMechanicHarness,
  serializeMechanicState,
  validateMechanicComposition,
  validateMechanicContract,
} from "../src/mechanics/index.js";
import { SPECIAL_ICON_IDS } from "../src/special-icons/index.js";
import { loadAndValidateLevel, parseLevelJson, validateLevel } from "../src/levels/index.js";
import { pack } from "./helpers.js";
import { throwIfErrors } from "../src/validation.js";
import { createRandomSource } from "../src/random/index.js";

function lineBoard() {
  return {
    topology: { kind: "linear" as const, notes: "mechanic harness graph" },
    cells: [
      { id: "a", position: { x: 0, y: 0 }, initialIcon: "dev.spark-a" },
      { id: "b", position: { x: 1, y: 0 }, initialIcon: "dev.spark-b" },
      { id: "c", position: { x: 2, y: 0 }, initialIcon: "dev.spark-c" },
    ],
    adjacency: [
      { from: "a", to: "b", direction: "along" },
      { from: "b", to: "c", direction: "along" },
    ],
  };
}

describe("Land mechanic contracts", () => {
  it("registers eight unimplemented Land placeholders", () => {
    const registry = createMechanicRegistry();
    expect(registry.placeholderIds()).toEqual(LAND_IDS.map((id) => reservedLandMechanicId(id)));
    for (const landId of LAND_IDS) {
      const mechanic = registry.get(`land.${landId}`);
      expect(mechanic.implemented).toBe(false);
      expect(mechanic.status).toBe("reserved");
      expect(mechanic.authority).toBe("graph");
      expect(mechanic.specialIconPolicy).toBe("universal-unchanged");
      expect(mechanic.glitterPolicy).toBe("landless-unchanged");
      expect(mechanic.accessibility.nonColorIndicator).toBe(`land.${landId}`);
      expect(mechanic.difficultyInfluence.length).toBeGreaterThan(0);
      expect(() => throwIfErrors(validateMechanicContract(mechanic))).not.toThrow();
    }
    expect(createDevelopmentMechanicRegistry().has(DEV_ECHO_MECHANIC_ID)).toBe(true);
    expect(createMechanicRegistry().has(DEV_ECHO_MECHANIC_ID)).toBe(false);
  });

  it("serializes mechanic state and executes deterministically", () => {
    const registry = createDevelopmentMechanicRegistry();
    const first = runMechanicHarness(
      {
        mechanicId: DEV_ECHO_MECHANIC_ID,
        board: lineBoard(),
        seed: "echo-seed",
        phase: "afterMove",
        move: { from: "a", to: "b" },
        initialPayload: { useRng: true },
        expectedPayload: { count: 1, lastFrom: "a", lastTo: "b" },
        expectedEffects: [{ kind: "visual-state-changed", mechanicId: DEV_ECHO_MECHANIC_ID }],
      },
      registry,
    );
    const second = runMechanicHarness(
      {
        mechanicId: DEV_ECHO_MECHANIC_ID,
        board: lineBoard(),
        seed: "echo-seed",
        phase: "afterMove",
        move: { from: "a", to: "b" },
        initialPayload: { useRng: true },
      },
      registry,
    );
    expect(compareMechanicState(first.state, second.state)).toBe(true);
    expect(first.effects[0]?.nonColorIndicator).toBe("echo-1");
    const snap = serializeMechanicState(first.state);
    expect(compareMechanicState(first.state, deserializeMechanicState(snap))).toBe(true);
    expect(first.explanation).toMatch(/afterMove/);
  });

  it("dispatches lifecycle hooks without land branching", () => {
    const registry = createDevelopmentMechanicRegistry();
    const board = createBoard(lineBoard());
    const mechanic = registry.get(DEV_ECHO_MECHANIC_ID);
    const result = dispatchMechanicPhase({
      phase: "afterMove",
      bindings: [{ id: DEV_ECHO_MECHANIC_ID }],
      states: { [DEV_ECHO_MECHANIC_ID]: mechanic.initialize() },
      registry,
      board,
      rng: createRandomSource("lifecycle"),
      move: { from: "b", to: "c" },
    });
    expect(result.effects).toHaveLength(1);
    expect(result.inspections[0]?.affectedCells).toEqual(["b", "c"]);
    expect(MECHANIC_LIFECYCLE).toContain("beforeMove");
    const source =
      readFileSync("src/mechanics/dispatch.ts", "utf8") +
      readFileSync("src/matching/detect.ts", "utf8") +
      readFileSync("src/cascade/pipeline.ts", "utf8");
    expect(source).not.toMatch(/if\s*\(\s*land\s*===\s*["'`]/);
  });

  it("validates dependencies, cycles, conflicts, and composition order", () => {
    const registry = createMechanicRegistry();
    const alpha = createDevEchoMechanic({
      id: "dev.alpha",
      priority: 10,
      exclusiveTopologyMutations: ["disable-edge"],
      topologyPermissions: ["disable-edge"],
    });
    const beta = createDevEchoMechanic({
      id: "dev.beta",
      priority: 20,
      dependencies: ["dev.alpha"],
      exclusiveTopologyMutations: ["enable-edge"],
      topologyPermissions: ["enable-edge"],
    });
    const gamma = createDevEchoMechanic({
      id: "dev.gamma",
      dependencies: ["dev.missing"],
    });
    const loopA = createDevEchoMechanic({ id: "dev.loop-a", dependencies: ["dev.loop-b"] });
    const loopB = createDevEchoMechanic({ id: "dev.loop-b", dependencies: ["dev.loop-a"] });
    for (const mechanic of [alpha, beta, gamma, loopA, loopB]) {
      registry.register(mechanic);
    }

    expect(composeMechanics([{ id: "dev.beta" }, { id: "dev.alpha" }], registry).map((item) => item.id)).toEqual([
      "dev.alpha",
      "dev.beta",
    ]);

    const conflicts = validateMechanicComposition(
      [{ id: "dev.alpha" }, { id: "dev.beta" }],
      registry,
    );
    expect(conflicts.some((item) => item.code === "mechanic.topology_conflict")).toBe(true);

    const missing = validateMechanicComposition([{ id: "dev.gamma" }], registry);
    expect(missing.some((item) => item.code === "mechanic.missing_dependency" || item.code === "mechanic.unbound_dependency")).toBe(
      true,
    );

    const circular = validateMechanicComposition([{ id: "dev.loop-a" }, { id: "dev.loop-b" }], registry);
    expect(circular.some((item) => item.code === "mechanic.circular_dependency")).toBe(true);

    const order = validateMechanicComposition(
      [
        { id: "dev.beta", priority: 1 },
        { id: "dev.alpha", priority: 9 },
      ],
      registry,
    );
    expect(order.some((item) => item.code === "mechanic.lifecycle_order")).toBe(true);

    expect(normalizeMechanicBindings(["dev.alpha", { id: "dev.beta", priority: 2 }])).toEqual([
      { id: "dev.alpha" },
      { id: "dev.beta", priority: 2 },
    ]);
  });

  it("isolates Lands, Special Icons, and the Glitter Icon", () => {
    const registry = createMechanicRegistry();
    const bloomaraOnLumina = validateMechanicComposition([{ id: "land.bloomara" }], registry, "lumina");
    expect(bloomaraOnLumina.some((item) => item.code === "mechanic.land_isolation")).toBe(true);

    const glitter = createProductionPack().icons.get(GLITTER_ICON_ID);
    expect(glitter.kind).toBe("glitter");
    if (glitter.kind === "glitter") {
      expect(glitter.landId).toBeNull();
    }
    for (const id of SPECIAL_ICON_IDS) {
      expect(registry.has(id)).toBe(false);
    }

    expect(() =>
      registry.register(
        createDevEchoMechanic({
          id: "glitter-bomb",
        }),
      ),
    ).toThrow(/Special Icon/);

    const issues = validateLandDna(createLandRegistry(), createMechanicalVerbRegistry(), registry);
    expect(issues.filter((item) => item.severity === "error")).toEqual([]);
  });

  it("rejects coordinate-authority effects and color-only accessibility", () => {
    const registry = createDevelopmentMechanicRegistry();
    const broken = createDevEchoMechanic({
      id: "dev.xy",
      hooks: {
        afterMove(ctx) {
          return {
            state: { ...ctx.mechanicState, payload: { ...ctx.mechanicState.payload, x: 4, y: 9 } },
            effects: [
              {
                kind: "visual-state-changed",
                mechanicId: "dev.xy",
                description: "illegal",
                nonColorIndicator: "xy",
                payload: { position: { x: 1, y: 2 } },
              },
            ],
          };
        },
      },
    });
    registry.register(broken);
    expect(() =>
      runMechanicHarness(
        {
          mechanicId: "dev.xy",
          board: lineBoard(),
          seed: "xy",
          phase: "afterMove",
          move: { from: "a", to: "b" },
        },
        registry,
      ),
    ).toThrow(/screen coordinates/);

    expect(
      validateMechanicContract(
        createDevEchoMechanic({
          id: "dev.color",
          accessibility: {
            ...createDevEchoMechanic().accessibility,
            nonColorIndicator: "",
          },
        }),
      ).some((item) => item.code === "mechanic.a11y_color_only"),
    ).toBe(true);
  });

  it("does not treat unimplemented Land placeholders as production level content", () => {
    const raw = JSON.parse(readFileSync("data/dev/branching-smoke.json", "utf8"));
    const level = loadAndValidateLevel(raw, { ...pack(), profile: "development" });
    expect(level.mechanics ?? []).toEqual([]);
    const withPlaceholder = parseLevelJson({
      ...raw,
      mechanics: ["land.lumina"],
    });
    const issues = validateLevel(withPlaceholder, { ...pack(), profile: "development" });
    expect(issues.some((item) => item.code === "mechanic.unimplemented")).toBe(true);
  });
});

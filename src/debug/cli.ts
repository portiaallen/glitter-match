#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDevelopmentPack, createProductionPack } from "../content/packs.js";
import { loadAndValidateLevel } from "../levels/validate.js";
import { startLevel } from "../state/session.js";
import { formatInspection, inspectBoard, inspectPlayableBoard, toDot } from "./inspect.js";
import { parseBoardDocument } from "../board/document.js";
import { startPlayground } from "../lab/playground.js";

function usage(): never {
  console.error(`Glitter Match debug tooling

Usage:
  npm run debug -- inspect <level-or-board.json> [--seed <seed>] [--json]
  npm run debug -- validate <level-or-board.json> [--profile development|production]
  npm run debug -- matches <level-or-board.json> [--seed <seed>]
  npm run debug -- dot <level-or-board.json> [--seed <seed>]
  npm run debug -- force <level-or-board.json> --cells id=icon,id=icon [--seed <seed>]
  npm run debug -- why <board.json> --pair a,b
`);
  process.exit(1);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function isBoardDocument(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "purpose" in value && (value as { purpose: string }).purpose === "engine-fixture");
}

const [command, filePath] = process.argv.slice(2);
if (!command || !filePath) {
  usage();
}

const profile = (argValue("--profile") as "development" | "production" | undefined) ?? "development";
const pack = profile === "production" ? createProductionPack() : createDevelopmentPack();
const seed = argValue("--seed") ?? "debug-seed";
const raw = readJson(filePath);

try {
  if (isBoardDocument(raw)) {
    const document = parseBoardDocument(raw);
    if (command === "validate") {
      console.log(`OK ${document.id} (board fixture)`);
      process.exit(0);
    }
    const playground = startPlayground({ document, registries: pack, seed });
    if (command === "force") {
      const cellsArg = argValue("--cells");
      if (!cellsArg) {
        usage();
      }
      const occupants: Record<string, string | null> = {};
      for (const token of cellsArg.split(",")) {
        const [id, icon] = token.split("=");
        if (!id) {
          continue;
        }
        occupants[id] = icon && icon !== "empty" ? icon : null;
      }
      playground.forceOccupants(occupants);
    }
    if (command === "why") {
      const pair = argValue("--pair");
      if (!pair) {
        usage();
      }
      const [a, b] = pair.split(",");
      console.log(JSON.stringify(playground.explain(a!, b!), null, 2));
      process.exit(0);
    }
    const inspection = inspectPlayableBoard(playground.board, playground.matchRules, pack.icons, pack.obstacles);
    if (command === "dot") {
      console.log(toDot(inspection));
      process.exit(0);
    }
    if (command === "inspect" || command === "matches" || command === "force") {
      if (hasFlag("--json")) {
        console.log(JSON.stringify({ inspection, objective: playground.objectiveProgress(), cascadeCount: playground.cascadeCount }, null, 2));
      } else {
        console.log(formatInspection(inspection));
        console.log(`cascade: ${playground.cascadeCount}`);
        console.log(`objective: ${JSON.stringify(playground.objectiveProgress())}`);
        console.log(`seed: ${seed}`);
      }
      process.exit(0);
    }
    usage();
  }

  const level = loadAndValidateLevel(raw, { ...pack, profile });

  if (command === "validate") {
    console.log(`OK ${level.id} (${level.status})`);
    process.exit(0);
  }

  const session = startLevel({
    level,
    registries: pack,
    seed,
  });

  if (command === "force") {
    const cellsArg = argValue("--cells");
    if (!cellsArg) {
      usage();
    }
    const occupants: Record<string, string | null> = {};
    for (const token of cellsArg.split(",")) {
      const [id, icon] = token.split("=");
      if (!id) {
        continue;
      }
      occupants[id] = icon && icon !== "empty" ? icon : null;
    }
    session.forceOccupants(occupants);
  }

  const inspection = inspectBoard(session.state.board, level, pack.icons, pack.obstacles);

  if (command === "dot") {
    console.log(toDot(inspection));
    process.exit(0);
  }

  if (command === "inspect" || command === "matches" || command === "force") {
    if (hasFlag("--json")) {
      console.log(JSON.stringify({ inspection, status: session.state.status, objective: session.inspectObjective() }, null, 2));
    } else {
      console.log(formatInspection(inspection));
      console.log(`status: ${session.state.status}`);
      console.log(`objective: ${JSON.stringify(session.inspectObjective())}`);
      console.log(`seed: ${seed}`);
    }
    process.exit(0);
  }

  usage();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

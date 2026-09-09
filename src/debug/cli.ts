#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDevelopmentPack, createProductionPack } from "../content/packs.js";
import { loadAndValidateLevel } from "../levels/validate.js";
import { startLevel } from "../state/session.js";
import { formatInspection, inspectBoard, toDot } from "./inspect.js";

function usage(): never {
  console.error(`Glitter Match debug tooling

Usage:
  npm run debug -- inspect <level.json> [--seed <seed>] [--json]
  npm run debug -- validate <level.json> [--profile development|production]
  npm run debug -- matches <level.json> [--seed <seed>]
  npm run debug -- dot <level.json> [--seed <seed>]
  npm run debug -- force <level.json> --cells id=icon,id=icon [--seed <seed>]
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

const [command, levelPath] = process.argv.slice(2);
if (!command || !levelPath) {
  usage();
}

const profile = (argValue("--profile") as "development" | "production" | undefined) ?? "development";
const pack = profile === "production" ? createProductionPack() : createDevelopmentPack();
const seed = argValue("--seed") ?? "debug-seed";

try {
  const level = loadAndValidateLevel(readJson(levelPath), { ...pack, profile });

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

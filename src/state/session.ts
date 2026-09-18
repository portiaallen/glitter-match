import type { CascadeReport } from "../cascade/index.js";
import type { IconRegistry } from "../icons/index.js";
import type { LandRegistry } from "../lands/index.js";
import { createLandRegistry } from "../lands/index.js";
import type { LevelDefinition } from "../levels/index.js";
import type { MechanicRegistry } from "../mechanics/index.js";
import {
  createObjective,
  type Objective,
  type ObjectiveProgress,
  type WinStateResult,
} from "../objectives/index.js";
import type { ObstacleRegistry } from "../obstacles/index.js";
import type { PlayerProgression } from "../progression/index.js";
import { loadLevelRuntime, type LevelRuntime } from "../runtime/index.js";
import type { SpecialIconInventory } from "../special-icons/index.js";
import { issue, throwIfErrors } from "../validation.js";
import type { AuthoritativeGameState, PresentationState } from "./types.js";

export interface EngineRegistries {
  icons: IconRegistry;
  obstacles: ObstacleRegistry;
  mechanics: MechanicRegistry;
  lands?: LandRegistry;
}

export interface StartLevelOptions {
  level: LevelDefinition;
  registries: EngineRegistries;
  seed: string;
  specialInventory?: SpecialIconInventory;
  progression?: PlayerProgression;
}

/**
 * Legacy session facade.
 *
 * Gameplay now belongs to {@link LevelRuntime}. This class preserves the
 * existing startLevel/swap API so tests and debug tools keep one play path.
 */
export class GameSession {
  readonly runtime: LevelRuntime;
  readonly level: LevelDefinition;
  readonly registries: EngineRegistries;
  readonly objective: Objective;

  constructor(options: StartLevelOptions) {
    this.level = options.level;
    this.registries = options.registries;
    this.objective = createObjective(options.level.objective);
    this.runtime = loadLevelRuntime({
      level: options.level,
      registries: options.registries,
      seed: options.seed,
      specialInventory: options.specialInventory,
      progression: options.progression,
      validation: {
        icons: options.registries.icons,
        obstacles: options.registries.obstacles,
        mechanics: options.registries.mechanics,
        lands: options.registries.lands ?? createLandRegistry(),
        profile: options.level.status === "production" ? "production" : "development",
      },
    });
  }

  get progression(): PlayerProgression {
    return this.runtime.legacyProgression;
  }

  set progression(value: PlayerProgression) {
    this.runtime.legacyProgression = value;
  }

  get presentation(): PresentationState {
    return this.runtime.presentation;
  }

  set presentation(value: PresentationState) {
    this.runtime.presentation = value;
  }

  get state(): AuthoritativeGameState {
    return this.runtime.authoritativeState;
  }

  inspectObjective(): ObjectiveProgress {
    return this.runtime.inspectObjective();
  }

  inspectWinState(): WinStateResult {
    return this.runtime.inspectWinState();
  }

  swap(a: string, b: string): CascadeReport {
    const result = this.runtime.submitMove({ sourceCellId: a, targetCellId: b });
    if (!result.accepted) {
      if (result.error) {
        throwIfErrors([issue("session.engine_error", "swap", result.error.message)], "Runtime resolution error");
      }
      const code = result.rejection?.code === "NO_MATCH" ? "swap.no_match" : result.rejection?.code === "SESSION_NOT_READY" || result.rejection?.code === "SESSION_ALREADY_COMPLETE" || result.rejection?.code === "SESSION_ALREADY_FAILED" || result.rejection?.code === "SESSION_RESOLVING" ? "session.not_playing" : "swap.illegal";
      const heading = result.rejection?.code === "NO_MATCH" ? "Swap did not match" : "Illegal swap";
      throwIfErrors(
        [issue(code, "swap", result.rejection?.reason ?? `Cannot swap "${a}" and "${b}".`)],
        heading,
      );
    }
    const cascade = result.cascade;
    if (!cascade) {
      throwIfErrors(
        [issue("session.engine_error", "swap", "Accepted move produced no cascade report.")],
        "Runtime resolution error",
      );
      throw new Error("Accepted move produced no cascade report.");
    }
    return cascade;
  }

  forceOccupants(occupants: Record<string, string | null>): void {
    this.runtime.debugForceOccupants(occupants);
  }
}

export function startLevel(options: StartLevelOptions): GameSession {
  return new GameSession(options);
}

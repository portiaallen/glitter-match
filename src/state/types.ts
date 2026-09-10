import type { CellId } from "../ids.js";
import type { Board } from "../board/index.js";
import type { CascadeReport } from "../cascade/index.js";
import type { EarnedReward } from "../economy/index.js";
import type { LevelDefinition } from "../levels/index.js";
import type { GameStats, ObjectiveProgress } from "../objectives/index.js";
import type { PlayerProgression } from "../progression/index.js";
import type { RandomSnapshot } from "../random/index.js";
import type { MechanicState } from "../mechanics/index.js";
import type { SpecialIconInventory } from "../special-icons/index.js";
import type { SpecialMatchRuntime } from "../special-matches/index.js";
import type { AccessibilitySettings } from "../ui/accessibility.js";

export type SessionStatus = "playing" | "won" | "lost" | "dead-unrecovered";

export interface AuthoritativeGameState {
  levelId: string;
  land: LevelDefinition["land"];
  board: Board;
  stats: GameStats;
  movesRemaining: number | null;
  timeRemainingMs: number | null;
  combo: number;
  lastCascade: CascadeReport | null;
  specialInventory: SpecialIconInventory;
  /** Board Special Matches. Distinct from inventory Special Icons. */
  specialMatches: SpecialMatchRuntime;
  earnedRewards: EarnedReward[];
  status: SessionStatus;
  rng: RandomSnapshot;
  seed: string;
  /** Serializable mechanic instance state. Never hide gameplay state off-session. */
  mechanicStates: Record<string, MechanicState>;
}

export interface PresentationState {
  selectedCellId: CellId | null;
  highlightedCellIds: CellId[];
  pendingCascade: CascadeReport | null;
  accessibility: AccessibilitySettings;
}

export interface GameSnapshot {
  authoritative: AuthoritativeGameState;
  presentation: PresentationState;
  progression: PlayerProgression;
  objective: ObjectiveProgress;
}

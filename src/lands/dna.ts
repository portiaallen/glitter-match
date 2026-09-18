import type { DifficultyDimension, DifficultyVector } from "../difficulty/model.js";
import type { LandId } from "../ids.js";
import type { AccessibilitySettings } from "../ui/accessibility.js";
import type { MechanicalVerbId } from "./verbs.js";

/**
 * Land DNA describes vocabulary, not puzzles.
 * Registered handlers provide behavior. Land definitions never hardcode it.
 */
export interface LandFinaleContract {
  /** Must stay null while campaign authoring is locked. */
  levelRef: string | null;
  type: "signature";
  experienceCategory: string | null;
  notes: string;
}

export interface LandProgressionMetadata {
  order: number;
  packPrefix: string;
  mechanicIntroductionRefs: string[];
  difficultyTendencies: Partial<DifficultyVector>;
  finaleDesignation: "level-80-signature";
  gateTransitionRefs: string[];
}

export interface LandAccessibilityConsiderations {
  reducedMotion: string;
  nonColorOnly: string;
  textState: string;
  audioCues: string;
  hapticCues: string;
  timingAccommodations: string;
  stateChangeIndication: string;
}

export interface LandDna {
  id: LandId;
  slug: LandId;
  name: string;
  philosophicalQuestion: string;
  coreTheme: string;
  designPrinciple: string;
  mechanicalLanguage: string[];
  mechanicalVerbs: MechanicalVerbId[];
  boardLanguage: string;
  movementLanguage: string;
  matchLanguage: string;
  obstacleLanguage: string;
  objectiveLanguage: string;
  mechanicRegistry: string[];
  difficultyBias: Partial<DifficultyVector>;
  visualLanguage: string;
  audioLanguage: string;
  accessibilityConsiderations: LandAccessibilityConsiderations;
}

export const LAND_DIFFICULTY_BIAS_AXES: readonly DifficultyDimension[] = [
  "planningDepth",
  "spatialAwareness",
  "cascadeDependency",
  "timingDemand",
  "recoveryDifficulty",
  "topologyComplexity",
  "mechanicComplexity",
  "multitasking",
] as const;

export interface LandDefinition extends LandDna {
  /** Alias of `name` for Prompt #4 callers. */
  displayName: string;
  iconFamilyId: string;
  mechanicHandlerId: string;
  progression: LandProgressionMetadata;
  finale: LandFinaleContract;
  accessibilityDefaults: AccessibilitySettings;
  narrativeIdentity?: string;
}

export const UNRESOLVED_FINALE: LandFinaleContract = {
  levelRef: null,
  type: "signature",
  experienceCategory: null,
  notes: "Level 80 is a future signature finale. The reference stays unresolved while campaign authoring is locked.",
};

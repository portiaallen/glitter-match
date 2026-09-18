export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  reducedMotion: false,
  textScale: 1,
  nonColorIndicators: true,
  largeHitTargets: true,
  audioEnabled: true,
  audioVolume: 1,
  hapticsEnabled: true,
  screenReaderHints: true,
};

export interface AccessibilitySettings {
  reducedMotion: boolean;
  /** Multiplier for UI text. 1 is default. */
  textScale: number;
  /** Pattern/shape/label indicators in addition to color. */
  nonColorIndicators: boolean;
  /** Touch-friendly minimum target size. */
  largeHitTargets: boolean;
  audioEnabled: boolean;
  audioVolume: number;
  hapticsEnabled: boolean;
  screenReaderHints: boolean;
}

export interface PresentationContract {
  /**
   * Every visible icon must expose a non-color identifier.
   * Rendering layers must not rely on hue alone.
   */
  requirePatternAndLabel: true;
  minHitTargetPx: number;
}

export const DEFAULT_PRESENTATION_CONTRACT: PresentationContract = {
  requirePatternAndLabel: true,
  minHitTargetPx: 44,
};

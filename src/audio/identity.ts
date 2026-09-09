import type { LandId } from "../ids.js";

export interface AudioCue {
  id: string;
  description: string;
}

export interface LandAudioIdentity {
  landId: LandId;
  themeCueId?: string;
  matchCueId?: string;
  cascadeCueId?: string;
}

export interface AudioControls {
  enabled: boolean;
  volume: number;
  muted: boolean;
}

export function createAudioControls(): AudioControls {
  return { enabled: true, volume: 1, muted: false };
}

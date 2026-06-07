export type DecodeStatus = "idle" | "loading" | "success" | "error";

export type PreviewStatus = "idle" | "rendering" | "ready" | "error";

export type PlaybackSource = "original" | "preview";

export type PreviewPresetId = "auto" | "smooth" | "balanced" | "open";

export type HighTreatmentId = "soft" | "neutral" | "open";

export interface LocalAudioFileInfo {
  name: string;
  sizeBytes: number;
  type: string;
  lastModified: number;
}

export interface DecodedAudioInfo {
  durationSeconds: number;
  sampleRate: number;
  numberOfChannels: number;
  length: number;
}

export interface DecodedAudioData {
  file: LocalAudioFileInfo;
  info: DecodedAudioInfo;
  audioBuffer: AudioBuffer;
}

export interface AudioMetrics {
  peakLinear: number;
  peakDb: number;
  rmsLinear: number;
  rmsDb: number;
  crestFactorDb: number;
  durationSeconds: number;
}

export interface PreviewSettings {
  presetId: PreviewPresetId;
  highTreatment: HighTreatmentId;
  intensity: number;
  targetRmsDb: number;
  maxPeakDb: number;
}

export interface PreviewPreset {
  id: PreviewPresetId;
  label: string;
  description: string;
  settings: PreviewSettings;
}

export interface PreviewRenderResult {
  buffer: AudioBuffer;
  beforeMetrics: AudioMetrics;
  afterMetrics: AudioMetrics;
  renderTimeMs: number;
  settings: PreviewSettings;
}

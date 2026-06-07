export type DecodeStatus = "idle" | "loading" | "success" | "error";

export type AnalysisStatus = "idle" | "running" | "ready" | "error";

export type PreviewStatus = "idle" | "rendering" | "ready" | "error";

export type PlaybackSource = "original" | "preview";

export type PreviewPresetId = "auto" | "smooth" | "balanced" | "open" | "power";

export type HighTreatmentId = "soft" | "verySoft" | "neutral" | "open";

export type SourceRepairLevel = "light" | "normal" | "strong";

export type ListeningZoneFamily =
  | "Présence 2-5 kHz"
  | "Brillance 5-9 kHz"
  | "Fizz 9-16 kHz"
  | "Très haut aigu 16-20 kHz"
  | "Dynamique compacte"
  | "Pics proches du plafond"
  | "Stéréo instable"
  | "Bruit large bande possible"
  | "Sub sous 40 Hz"
  | "Déséquilibre spectral"
  | "Observation mixte";

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

export interface AdvancedAudioMetrics extends AudioMetrics {
  estimatedLufs: number;
  shortTermLufsEstimate: number;
  loudnessRangeEstimate: number;
  approxTruePeakDb: number;
  leftRightBalanceDb: number;
  stereoCorrelation: number;
  clippingSamples: number;
  clippingRatio: number;
  subRatio: number;
  lowRatio: number;
  presenceRatio: number;
  brightnessRatio: number;
  fizzRatio: number;
  ultraHighRatio: number;
  highTotalRatio: number;
  spectralCentroidHz: number;
  noiseFloorEstimateDb: number;
}

export interface ListeningObservation {
  family: ListeningZoneFamily;
  label: string;
  score: number;
  detail: string;
  listeningTip: string;
}

export interface ListeningZone {
  id: string;
  startSeconds: number;
  endSeconds: number;
  centerSeconds: number;
  priority: "haute" | "moyenne" | "basse";
  score: number;
  primaryFamily: ListeningZoneFamily;
  observations: ListeningObservation[];
}

export interface SourceAnalysisResult {
  metrics: AdvancedAudioMetrics;
  listeningZones: ListeningZone[];
  analysisTimeMs: number;
  windowsAnalyzed: number;
}

export interface PreviewSettings {
  presetId: PreviewPresetId;
  highTreatment: HighTreatmentId;
  intensity: number;
  targetRmsDb: number;
  targetLufsEstimate: number;
  maxPeakDb: number;
  stereoWidth: number;
  density: number;
  sourceRepair: SourceRepairLevel;
}

export interface PreviewPreset {
  id: PreviewPresetId;
  label: string;
  description: string;
  settings: PreviewSettings;
}

export interface ProcessingReport {
  profileLabel: string;
  brightnessLabel: string;
  targetLabel: string;
  appliedMoves: string[];
  cleanup: {
    declipActive: boolean;
    declickActive: boolean;
    dehissActive: boolean;
    clippedSamplesDetected: number;
    clicksRepaired: number;
    dehissReductionDb: number;
  };
  tone: {
    sourceRepairLabel: string;
    antiFizzActive: boolean;
    antiFizzReductionDb: number;
    subControlActive: boolean;
    stereoControlActive: boolean;
    densityActive: boolean;
    compressionActive: boolean;
  };
  loudness: {
    gainAppliedDb: number;
    targetRmsDb: number;
    targetLufsEstimate: number;
    limiterActive: boolean;
    limiterReductionDb: number;
  };
  performance: {
    renderTimeMs: number;
  };
}

export interface PreviewRenderResult {
  buffer: AudioBuffer;
  beforeMetrics: AdvancedAudioMetrics;
  afterMetrics: AdvancedAudioMetrics;
  renderTimeMs: number;
  settings: PreviewSettings;
  report: ProcessingReport;
}

export interface RealtimeMeterState {
  instantPeakDb: number;
  outputDb: number;
  shortTermLufsEstimate: number;
  integratedLufsEstimate: number;
  peakHoldDb: number;
  headroomDb: number;
  clipping: boolean;
  status: "silent" | "good" | "hot" | "clipping";
}

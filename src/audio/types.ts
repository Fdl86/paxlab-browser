export type DecodeStatus = "idle" | "loading" | "success" | "error";

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

export interface DecodeAudioResult {
  file: LocalAudioFileInfo;
  audio: DecodedAudioInfo;
}

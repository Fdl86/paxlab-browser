import type { DecodedAudioData, DecodedAudioInfo, LocalAudioFileInfo } from "./types";

type AudioContextConstructor = typeof AudioContext;

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

let sharedAudioContext: AudioContext | null = null;

const MAX_DECODED_DURATION_SECONDS = 15 * 60;
const MAX_DECODED_PCM_BYTES = 192 * 1024 * 1024;
const ESTIMATED_RENDER_BUFFER_MULTIPLIER = 7;
const MAX_ESTIMATED_RENDER_BYTES = 1280 * 1024 * 1024;

function formatMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
}

export function getAudioContext(): AudioContext {
  const audioWindow = window as WindowWithWebkitAudioContext;
  const AudioContextClass =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error(
      "Web Audio API indisponible dans ce navigateur. Essaie avec Chrome, Edge, Firefox ou Safari récent."
    );
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextClass();
  }

  return sharedAudioContext;
}

export async function ensureAudioContextRunning(): Promise<AudioContext> {
  const audioContext = getAudioContext();

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  return audioContext;
}

export async function decodeAudioFile(file: File): Promise<DecodedAudioData> {
  const audioContext = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    if (audioBuffer.duration > MAX_DECODED_DURATION_SECONDS) {
      throw new Error(
        `Fichier trop long (${formatMinutes(audioBuffer.duration)}). Pour protéger le navigateur, utilise un morceau de moins de ${formatMinutes(MAX_DECODED_DURATION_SECONDS)}.`
      );
    }

    const decodedPcmBytes = audioBuffer.length * audioBuffer.numberOfChannels * Float32Array.BYTES_PER_ELEMENT;
    const estimatedRenderBytes = decodedPcmBytes * ESTIMATED_RENDER_BUFFER_MULTIPLIER;

    if (decodedPcmBytes > MAX_DECODED_PCM_BYTES || estimatedRenderBytes > MAX_ESTIMATED_RENDER_BYTES) {
      const decodedMb = Math.round(decodedPcmBytes / (1024 * 1024));
      throw new Error(
        `Fichier trop volumineux après décodage (${decodedMb} Mo PCM). Pour protéger la mémoire du navigateur, utilise un fichier plus court, avec moins de canaux ou une fréquence d'échantillonnage plus basse.`
      );
    }

    const fileInfo: LocalAudioFileInfo = {
      name: file.name,
      sizeBytes: file.size,
      type: file.type,
      lastModified: file.lastModified
    };

    const info: DecodedAudioInfo = {
      durationSeconds: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length
    };

    return {
      file: fileInfo,
      info,
      audioBuffer
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Fichier trop long") ||
        error.message.includes("Fichier trop volumineux après décodage"))
    ) {
      throw error;
    }

    throw new Error(
      "Décodage impossible. Le fichier est peut-être corrompu, non supporté par ce navigateur, ou dans un format audio non reconnu. Essaie un WAV ou MP3 si le format échoue."
    );
  }
}

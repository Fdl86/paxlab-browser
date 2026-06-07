import type { DecodedAudioData, DecodedAudioInfo, LocalAudioFileInfo } from "./types";

type AudioContextConstructor = typeof AudioContext;

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

let sharedAudioContext: AudioContext | null = null;

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
  } catch {
    throw new Error(
      "Décodage impossible. Le fichier est peut-être corrompu, non supporté par le navigateur, ou dans un format audio non reconnu."
    );
  }
}

import type { DecodedAudioInfo } from "./types";

type AudioContextConstructor = typeof AudioContext;

type WindowWithWebkitAudioContext = Window &
  typeof globalThis & {
    webkitAudioContext?: AudioContextConstructor;
  };

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
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

export async function decodeAudioFile(file: File): Promise<DecodedAudioInfo> {
  const audioContext = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();

  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    return {
      durationSeconds: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length
    };
  } catch {
    throw new Error(
      "Décodage impossible. Le fichier est peut-être corrompu, non supporté par le navigateur, ou dans un format audio non reconnu."
    );
  }
}

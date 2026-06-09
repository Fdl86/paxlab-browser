import { useCallback, useEffect, useRef, useState } from "react";
import { ensureAudioContextRunning, getAudioContext } from "./decodeAudio";
import type { PlaybackSource, RealtimeMeterState } from "./types";

interface UseABAudioPlayerParams {
  originalBuffer: AudioBuffer | null;
  previewBuffer: AudioBuffer | null;
  monitorGainDbBySource?: Partial<Record<PlaybackSource, number>>;
}

interface UseABAudioPlayerResult {
  activeSource: PlaybackSource;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isSwitching: boolean;
  canPlayOriginal: boolean;
  canPlayPreview: boolean;
  meter: RealtimeMeterState;
  playPause: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (nextTime: number) => void;
  switchSource: (nextSource: PlaybackSource) => Promise<void>;
}

const SILENCE_DB = -90;
const SWITCH_FADE_SECONDS = 0.014;
const SWITCH_LOCK_SECONDS = 0.04;
const STOP_FADE_SECONDS = 0.018;
const START_FADE_SECONDS = 0.008;

const initialMeter: RealtimeMeterState = {
  instantPeakDb: SILENCE_DB,
  outputDb: SILENCE_DB,
  shortTermLufsEstimate: SILENCE_DB,
  integratedLufsEstimate: SILENCE_DB,
  peakHoldDb: SILENCE_DB,
  headroomDb: 0,
  clipping: false,
  status: "silent"
};

interface ShortTermWindow {
  time: number;
  square: number;
}

interface PlaybackVoice {
  sourceNode: AudioBufferSourceNode;
  gainNode: GainNode;
  analyser: AnalyserNode;
  token: number;
}

function getBufferForSource(
  source: PlaybackSource,
  originalBuffer: AudioBuffer | null,
  previewBuffer: AudioBuffer | null
): AudioBuffer | null {
  return source === "original" ? originalBuffer : previewBuffer;
}

function linearToDb(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return SILENCE_DB;
  }

  return Math.max(SILENCE_DB, 20 * Math.log10(value));
}

function dbToLinear(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.pow(10, value / 20);
}

function squareToDb(square: number): number {
  if (!Number.isFinite(square) || square <= 0) {
    return SILENCE_DB;
  }

  return linearToDb(Math.sqrt(square));
}

function loudnessEstimateFromRmsDb(rmsDb: number): number {
  if (rmsDb <= SILENCE_DB + 0.1) {
    return SILENCE_DB;
  }

  return rmsDb - 0.7;
}

function getMeterStatus(rmsDb: number, peakDb: number): RealtimeMeterState["status"] {
  if (peakDb >= -0.2) {
    return "clipping";
  }

  if (peakDb >= -1.15) {
    return "limited";
  }

  if (rmsDb >= -11) {
    return "hot";
  }

  if (rmsDb <= -65) {
    return "silent";
  }

  return "good";
}

function scheduleVoiceStop(voice: PlaybackVoice, fadeSeconds: number): void {
  const audioContext = getAudioContext();
  const now = audioContext.currentTime;
  const safeFade = Math.max(0, fadeSeconds);

  voice.sourceNode.onended = null;

  try {
    const currentGain = Math.max(0.0001, voice.gainNode.gain.value || 0.0001);
    voice.gainNode.gain.cancelScheduledValues(now);
    voice.gainNode.gain.setValueAtTime(currentGain, now);

    if (safeFade > 0) {
      voice.gainNode.gain.setTargetAtTime(0.0001, now, Math.max(0.003, safeFade / 3));
    } else {
      voice.gainNode.gain.setValueAtTime(0.0001, now);
    }
  } catch {
    // Certains navigateurs peuvent refuser une automation si le noeud est déjà arrêté.
  }

  try {
    voice.sourceNode.stop(now + safeFade + 0.006);
  } catch {
    // Un AudioBufferSourceNode ne peut être stoppé qu'une seule fois.
  }

  window.setTimeout(() => {
    try {
      voice.sourceNode.disconnect();
    } catch {
      // Déjà déconnecté.
    }

    try {
      voice.gainNode.disconnect();
    } catch {
      // Déjà déconnecté.
    }

    try {
      voice.analyser.disconnect();
    } catch {
      // Déjà déconnecté.
    }
  }, Math.ceil((safeFade + 0.08) * 1000));
}

export function useABAudioPlayer({
  originalBuffer,
  previewBuffer,
  monitorGainDbBySource
}: UseABAudioPlayerParams): UseABAudioPlayerResult {
  const [activeSource, setActiveSourceState] = useState<PlaybackSource>("original");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [meter, setMeter] = useState<RealtimeMeterState>(initialMeter);

  const currentVoiceRef = useRef<PlaybackVoice | null>(null);
  const activeVoicesRef = useRef<Set<PlaybackVoice>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const startContextTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const activeSourceRef = useRef<PlaybackSource>("original");
  const isPlayingRef = useRef(false);
  const originalBufferRef = useRef<AudioBuffer | null>(null);
  const previewBufferRef = useRef<AudioBuffer | null>(null);
  const monitorGainDbBySourceRef = useRef<Partial<Record<PlaybackSource, number>>>({});
  const currentTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const playbackTokenRef = useRef(0);
  const shortTermWindowsRef = useRef<ShortTermWindow[]>([]);
  const integratedSquareSumRef = useRef(0);
  const integratedFrameCountRef = useRef(0);
  const peakHoldDbRef = useRef(SILENCE_DB);
  const isSwitchingRef = useRef(false);
  const switchUnlockTimerRef = useRef<number | null>(null);

  const activeBuffer = getBufferForSource(activeSource, originalBuffer, previewBuffer);
  const duration = activeBuffer?.duration ?? originalBuffer?.duration ?? 0;
  const canPlayOriginal = Boolean(originalBuffer);
  const canPlayPreview = Boolean(previewBuffer);

  useEffect(() => {
    activeSourceRef.current = activeSource;
  }, [activeSource]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    originalBufferRef.current = originalBuffer;
    previewBufferRef.current = previewBuffer;
  }, [originalBuffer, previewBuffer]);

  useEffect(() => {
    monitorGainDbBySourceRef.current = monitorGainDbBySource ?? {};
  }, [monitorGainDbBySource]);

  const resetMeter = useCallback(() => {
    shortTermWindowsRef.current = [];
    integratedSquareSumRef.current = 0;
    integratedFrameCountRef.current = 0;
    peakHoldDbRef.current = SILENCE_DB;
    setMeter(initialMeter);
  }, []);

  const resetIntegratedMeterOnly = useCallback(() => {
    shortTermWindowsRef.current = [];
    integratedSquareSumRef.current = 0;
    integratedFrameCountRef.current = 0;
    peakHoldDbRef.current = SILENCE_DB;
  }, []);

  const readCurrentOffset = useCallback(() => {
    const sourceBuffer = getBufferForSource(
      activeSourceRef.current,
      originalBufferRef.current,
      previewBufferRef.current
    );

    if (!sourceBuffer) {
      return 0;
    }

    if (!isPlayingRef.current) {
      return Math.min(currentTimeRef.current, sourceBuffer.duration);
    }

    const audioContext = getAudioContext();
    const elapsed = audioContext.currentTime - startContextTimeRef.current;
    return Math.min(Math.max(startOffsetRef.current + elapsed, 0), sourceBuffer.duration);
  }, []);

  const fadeOutExistingVoices = useCallback((fadeSeconds: number) => {
    playbackTokenRef.current += 1;

    for (const voice of activeVoicesRef.current) {
      scheduleVoiceStop(voice, fadeSeconds);
    }

    activeVoicesRef.current.clear();
    currentVoiceRef.current = null;
  }, []);

  const stopEverySource = useCallback(
    (fadeSeconds = 0) => {
      fadeOutExistingVoices(fadeSeconds);
      analyserRef.current = null;
      analyserDataRef.current = null;
    },
    [fadeOutExistingVoices]
  );

  const startSource = useCallback(
    async (sourceName: PlaybackSource, offset: number, stopExisting = true) => {
      const sourceBuffer = getBufferForSource(
        sourceName,
        originalBufferRef.current,
        previewBufferRef.current
      );

      if (!sourceBuffer) {
        return;
      }

      if (stopExisting) {
        stopEverySource();
      }

      const safeOffset = Math.min(Math.max(offset, 0), Math.max(sourceBuffer.duration - 0.02, 0));
      const audioContext = await ensureAudioContextRunning();
      const sourceNode = audioContext.createBufferSource();
      const gainNode = audioContext.createGain();
      const analyser = audioContext.createAnalyser();
      const token = playbackTokenRef.current + 1;

      playbackTokenRef.current = token;
      sourceNode.buffer = sourceBuffer;
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      const monitorGainLinear = dbToLinear(monitorGainDbBySourceRef.current[sourceName] ?? 0);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.setTargetAtTime(monitorGainLinear, audioContext.currentTime, START_FADE_SECONDS / 3);

      sourceNode
        .connect(gainNode)
        .connect(analyser)
        .connect(audioContext.destination);

      const voice: PlaybackVoice = {
        sourceNode,
        gainNode,
        analyser,
        token
      };

      analyserRef.current = analyser;
      analyserDataRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)
      );

      sourceNode.onended = () => {
        activeVoicesRef.current.delete(voice);

        if (token !== playbackTokenRef.current || currentVoiceRef.current !== voice) {
          return;
        }

        currentVoiceRef.current = null;
        setIsPlaying(false);
        isPlayingRef.current = false;
        setCurrentTime(sourceBuffer.duration);
      };

      sourceNode.start(0, safeOffset);
      activeVoicesRef.current.add(voice);
      currentVoiceRef.current = voice;
      startOffsetRef.current = safeOffset;
      startContextTimeRef.current = audioContext.currentTime;
      resetIntegratedMeterOnly();
      setCurrentTime(safeOffset);
      currentTimeRef.current = safeOffset;
      setIsPlaying(true);
      isPlayingRef.current = true;
    },
    [resetIntegratedMeterOnly, stopEverySource]
  );

  const pause = useCallback(() => {
    const offset = readCurrentOffset();
    stopEverySource(STOP_FADE_SECONDS);
    setCurrentTime(offset);
    currentTimeRef.current = offset;
    setIsPlaying(false);
    isPlayingRef.current = false;
    resetMeter();
  }, [readCurrentOffset, resetMeter, stopEverySource]);

  const stop = useCallback(() => {
    stopEverySource(STOP_FADE_SECONDS);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    setIsPlaying(false);
    isPlayingRef.current = false;
    resetMeter();
  }, [resetMeter, stopEverySource]);

  const playPause = useCallback(async () => {
    if (isPlayingRef.current) {
      pause();
      return;
    }

    const sourceBuffer = getBufferForSource(
      activeSourceRef.current,
      originalBufferRef.current,
      previewBufferRef.current
    );

    if (!sourceBuffer) {
      return;
    }

    const startAt = currentTimeRef.current >= sourceBuffer.duration - 0.05 ? 0 : currentTimeRef.current;
    await startSource(activeSourceRef.current, startAt);
  }, [pause, startSource]);

  const seek = useCallback(
    (nextTime: number) => {
      const sourceBuffer = getBufferForSource(
        activeSourceRef.current,
        originalBufferRef.current,
        previewBufferRef.current
      );

      if (!sourceBuffer) {
        setCurrentTime(0);
        currentTimeRef.current = 0;
        return;
      }

      const safeTime = Math.min(Math.max(nextTime, 0), sourceBuffer.duration);
      const wasPlaying = isPlayingRef.current;

      stopEverySource(STOP_FADE_SECONDS);
      setCurrentTime(safeTime);
      currentTimeRef.current = safeTime;
      setIsPlaying(false);
      isPlayingRef.current = false;
      resetMeter();

      if (wasPlaying) {
        void startSource(activeSourceRef.current, safeTime);
      }
    },
    [resetMeter, startSource, stopEverySource]
  );

  const switchSource = useCallback(
    async (nextSource: PlaybackSource) => {
      if (isSwitchingRef.current) {
        return;
      }

      if (nextSource === "preview" && !previewBufferRef.current) {
        return;
      }

      if (nextSource === activeSourceRef.current) {
        return;
      }

      const nextBuffer = getBufferForSource(nextSource, originalBufferRef.current, previewBufferRef.current);
      if (!nextBuffer) {
        return;
      }

      isSwitchingRef.current = true;
      setIsSwitching(true);

      if (switchUnlockTimerRef.current !== null) {
        window.clearTimeout(switchUnlockTimerRef.current);
      }

      const offset = Math.min(readCurrentOffset(), Math.max(nextBuffer.duration - 0.02, 0));
      const wasPlaying = isPlayingRef.current;

      if (wasPlaying) {
        fadeOutExistingVoices(SWITCH_FADE_SECONDS);
      } else {
        stopEverySource();
      }

      setActiveSourceState(nextSource);
      activeSourceRef.current = nextSource;
      setCurrentTime(offset);
      currentTimeRef.current = offset;
      if (!wasPlaying) {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
      resetIntegratedMeterOnly();

      if (wasPlaying) {
        await startSource(nextSource, offset, false);
      } else {
        resetMeter();
      }

      switchUnlockTimerRef.current = window.setTimeout(() => {
        isSwitchingRef.current = false;
        setIsSwitching(false);
        switchUnlockTimerRef.current = null;
      }, Math.ceil(SWITCH_LOCK_SECONDS * 1000));
    },
    [fadeOutExistingVoices, readCurrentOffset, resetIntegratedMeterOnly, resetMeter, startSource, stopEverySource]
  );

  const updateMeter = useCallback(() => {
    const analyser = analyserRef.current;
    const data = analyserDataRef.current;

    if (!isPlayingRef.current || !analyser || !data) {
      return;
    }

    analyser.getFloatTimeDomainData(data);

    let peak = 0;
    let sumSquares = 0;

    for (let index = 0; index < data.length; index += 1) {
      const value = data[index];
      const abs = Math.abs(value);
      peak = Math.max(peak, abs);
      sumSquares += value * value;
    }

    const square = sumSquares / Math.max(1, data.length);
    const rmsDb = squareToDb(square);
    const peakDb = linearToDb(peak);
    const now = performance.now();

    shortTermWindowsRef.current.push({ time: now, square });
    shortTermWindowsRef.current = shortTermWindowsRef.current.filter(
      (item) => now - item.time <= 3000
    );

    integratedSquareSumRef.current += square;
    integratedFrameCountRef.current += 1;

    const shortSquare =
      shortTermWindowsRef.current.reduce((sum, item) => sum + item.square, 0) /
      Math.max(1, shortTermWindowsRef.current.length);
    const integratedSquare =
      integratedSquareSumRef.current / Math.max(1, integratedFrameCountRef.current);

    peakHoldDbRef.current = Math.max(peakHoldDbRef.current - 0.018, peakDb);

    const peakHoldDb = peakHoldDbRef.current;
    const status = getMeterStatus(rmsDb, peakHoldDb);

    setMeter({
      instantPeakDb: peakDb,
      outputDb: rmsDb,
      shortTermLufsEstimate: loudnessEstimateFromRmsDb(squareToDb(shortSquare)),
      integratedLufsEstimate: loudnessEstimateFromRmsDb(squareToDb(integratedSquare)),
      peakHoldDb,
      headroomDb: Math.max(0, -peakHoldDb),
      clipping: status === "clipping",
      status
    });
  }, []);

  useEffect(() => {
    function tick() {
      if (isPlayingRef.current) {
        setCurrentTime(readCurrentOffset());
        updateMeter();
      }

      animationFrameRef.current = window.requestAnimationFrame(tick);
    }

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      if (switchUnlockTimerRef.current !== null) {
        window.clearTimeout(switchUnlockTimerRef.current);
      }
    };
  }, [readCurrentOffset, updateMeter]);

  useEffect(() => {
    stop();
    setActiveSourceState("original");
    activeSourceRef.current = "original";
  }, [originalBuffer, stop]);

  useEffect(() => {
    if (!previewBuffer && activeSourceRef.current === "preview") {
      void switchSource("original");
    }
  }, [previewBuffer, switchSource]);

  useEffect(() => {
    return () => {
      stopEverySource();
    };
  }, [stopEverySource]);

  return {
    activeSource,
    currentTime,
    duration,
    isPlaying,
    isSwitching,
    canPlayOriginal,
    canPlayPreview,
    meter,
    playPause,
    pause,
    stop,
    seek,
    switchSource
  };
}

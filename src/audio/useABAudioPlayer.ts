import { useCallback, useEffect, useRef, useState } from "react";
import { ensureAudioContextRunning, getAudioContext } from "./decodeAudio";
import type { PlaybackSource, RealtimeMeterState } from "./types";

interface UseABAudioPlayerParams {
  originalBuffer: AudioBuffer | null;
  previewBuffer: AudioBuffer | null;
}

interface UseABAudioPlayerResult {
  activeSource: PlaybackSource;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
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

  if (peakDb >= -1.1 || rmsDb >= -11) {
    return "hot";
  }

  if (rmsDb <= -65) {
    return "silent";
  }

  return "good";
}

export function useABAudioPlayer({
  originalBuffer,
  previewBuffer
}: UseABAudioPlayerParams): UseABAudioPlayerResult {
  const [activeSource, setActiveSourceState] = useState<PlaybackSource>("original");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [meter, setMeter] = useState<RealtimeMeterState>(initialMeter);

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const activeNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const startContextTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const activeSourceRef = useRef<PlaybackSource>("original");
  const isPlayingRef = useRef(false);
  const originalBufferRef = useRef<AudioBuffer | null>(null);
  const previewBufferRef = useRef<AudioBuffer | null>(null);
  const currentTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const playbackTokenRef = useRef(0);
  const shortTermWindowsRef = useRef<ShortTermWindow[]>([]);
  const integratedSquareSumRef = useRef(0);
  const integratedFrameCountRef = useRef(0);
  const peakHoldDbRef = useRef(SILENCE_DB);

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

  const resetMeter = useCallback(() => {
    shortTermWindowsRef.current = [];
    integratedSquareSumRef.current = 0;
    integratedFrameCountRef.current = 0;
    peakHoldDbRef.current = SILENCE_DB;
    setMeter(initialMeter);
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

  const stopEverySource = useCallback(() => {
    playbackTokenRef.current += 1;

    for (const node of activeNodesRef.current) {
      try {
        node.onended = null;
        node.stop(0);
      } catch {
        // Un AudioBufferSourceNode ne peut être stoppé qu'une seule fois.
      }

      try {
        node.disconnect();
      } catch {
        // Déjà déconnecté.
      }
    }

    activeNodesRef.current.clear();
    sourceNodeRef.current = null;
  }, []);

  const startSource = useCallback(
    async (sourceName: PlaybackSource, offset: number) => {
      const sourceBuffer = getBufferForSource(
        sourceName,
        originalBufferRef.current,
        previewBufferRef.current
      );

      if (!sourceBuffer) {
        return;
      }

      stopEverySource();

      const safeOffset = Math.min(Math.max(offset, 0), Math.max(sourceBuffer.duration - 0.02, 0));
      const audioContext = await ensureAudioContextRunning();
      const sourceNode = audioContext.createBufferSource();
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      analyserRef.current = analyser;
      analyserDataRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));

      const token = playbackTokenRef.current;
      sourceNode.buffer = sourceBuffer;
      sourceNode
        .connect(analyser)
        .connect(audioContext.destination);

      sourceNode.onended = () => {
        if (token !== playbackTokenRef.current || sourceNodeRef.current !== sourceNode) {
          return;
        }

        activeNodesRef.current.delete(sourceNode);
        sourceNodeRef.current = null;
        setIsPlaying(false);
        isPlayingRef.current = false;
        setCurrentTime(sourceBuffer.duration);
      };

      sourceNode.start(0, safeOffset);
      activeNodesRef.current.add(sourceNode);
      sourceNodeRef.current = sourceNode;
      startOffsetRef.current = safeOffset;
      startContextTimeRef.current = audioContext.currentTime;
      shortTermWindowsRef.current = [];
      integratedSquareSumRef.current = 0;
      integratedFrameCountRef.current = 0;
      peakHoldDbRef.current = SILENCE_DB;
      setCurrentTime(safeOffset);
      currentTimeRef.current = safeOffset;
      setIsPlaying(true);
      isPlayingRef.current = true;
    },
    [stopEverySource]
  );

  const pause = useCallback(() => {
    const offset = readCurrentOffset();
    stopEverySource();
    setCurrentTime(offset);
    currentTimeRef.current = offset;
    setIsPlaying(false);
    isPlayingRef.current = false;
    resetMeter();
  }, [readCurrentOffset, resetMeter, stopEverySource]);

  const stop = useCallback(() => {
    stopEverySource();
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

      stopEverySource();
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

      const offset = Math.min(readCurrentOffset(), nextBuffer.duration);
      const wasPlaying = isPlayingRef.current;

      stopEverySource();
      setActiveSourceState(nextSource);
      activeSourceRef.current = nextSource;
      setCurrentTime(offset);
      currentTimeRef.current = offset;
      setIsPlaying(false);
      isPlayingRef.current = false;
      resetMeter();

      if (wasPlaying) {
        await startSource(nextSource, offset);
      }
    },
    [readCurrentOffset, resetMeter, startSource, stopEverySource]
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

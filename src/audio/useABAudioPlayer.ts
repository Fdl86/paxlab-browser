import { useCallback, useEffect, useRef, useState } from "react";
import { ensureAudioContextRunning, getAudioContext } from "./decodeAudio";
import type { PlaybackSource } from "./types";

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
  playPause: () => Promise<void>;
  pause: () => void;
  seek: (nextTime: number) => void;
  switchSource: (nextSource: PlaybackSource) => Promise<void>;
}

function getBufferForSource(
  source: PlaybackSource,
  originalBuffer: AudioBuffer | null,
  previewBuffer: AudioBuffer | null
): AudioBuffer | null {
  return source === "original" ? originalBuffer : previewBuffer;
}

export function useABAudioPlayer({
  originalBuffer,
  previewBuffer
}: UseABAudioPlayerParams): UseABAudioPlayerResult {
  const [activeSource, setActiveSourceState] = useState<PlaybackSource>("original");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startContextTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const activeSourceRef = useRef<PlaybackSource>("original");
  const isPlayingRef = useRef(false);
  const originalBufferRef = useRef<AudioBuffer | null>(null);
  const previewBufferRef = useRef<AudioBuffer | null>(null);
  const currentTimeRef = useRef(0);
  const ignoreEndedRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  const duration = originalBuffer?.duration ?? 0;
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

  const stopSource = useCallback(() => {
    if (!sourceNodeRef.current) {
      return;
    }

    ignoreEndedRef.current = true;

    try {
      sourceNodeRef.current.stop();
    } catch {
      // Le noeud peut déjà être arrêté. Ce n'est pas bloquant.
    }

    sourceNodeRef.current.disconnect();
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

      const safeOffset = Math.min(Math.max(offset, 0), Math.max(sourceBuffer.duration - 0.02, 0));
      const audioContext = await ensureAudioContextRunning();
      const sourceNode = audioContext.createBufferSource();

      sourceNode.buffer = sourceBuffer;
      sourceNode.connect(audioContext.destination);
      sourceNode.onended = () => {
        if (ignoreEndedRef.current) {
          ignoreEndedRef.current = false;
          return;
        }

        sourceNodeRef.current = null;
        setIsPlaying(false);
        setCurrentTime(sourceBuffer.duration);
      };

      sourceNode.start(0, safeOffset);
      sourceNodeRef.current = sourceNode;
      startOffsetRef.current = safeOffset;
      startContextTimeRef.current = audioContext.currentTime;
      setCurrentTime(safeOffset);
      setIsPlaying(true);
    },
    []
  );

  const pause = useCallback(() => {
    const offset = readCurrentOffset();
    stopSource();
    setCurrentTime(offset);
    setIsPlaying(false);
  }, [readCurrentOffset, stopSource]);

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

    const startAt = currentTime >= sourceBuffer.duration - 0.05 ? 0 : currentTime;
    await startSource(activeSourceRef.current, startAt);
  }, [currentTime, pause, startSource]);

  const seek = useCallback(
    (nextTime: number) => {
      const sourceBuffer = getBufferForSource(
        activeSourceRef.current,
        originalBufferRef.current,
        previewBufferRef.current
      );

      if (!sourceBuffer) {
        setCurrentTime(0);
        return;
      }

      const safeTime = Math.min(Math.max(nextTime, 0), sourceBuffer.duration);
      const wasPlaying = isPlayingRef.current;

      stopSource();
      setCurrentTime(safeTime);
      setIsPlaying(false);

      if (wasPlaying) {
        void startSource(activeSourceRef.current, safeTime);
      }
    },
    [startSource, stopSource]
  );

  const switchSource = useCallback(
    async (nextSource: PlaybackSource) => {
      if (nextSource === "preview" && !previewBufferRef.current) {
        return;
      }

      if (nextSource === activeSourceRef.current) {
        return;
      }

      const offset = readCurrentOffset();
      const wasPlaying = isPlayingRef.current;

      stopSource();
      setActiveSourceState(nextSource);
      activeSourceRef.current = nextSource;
      setCurrentTime(offset);
      setIsPlaying(false);

      if (wasPlaying) {
        await startSource(nextSource, offset);
      }
    },
    [readCurrentOffset, startSource, stopSource]
  );

  useEffect(() => {
    function tick() {
      if (isPlayingRef.current) {
        setCurrentTime(readCurrentOffset());
      }

      animationFrameRef.current = window.requestAnimationFrame(tick);
    }

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [readCurrentOffset]);

  useEffect(() => {
    stopSource();
    setActiveSourceState("original");
    activeSourceRef.current = "original";
    setCurrentTime(0);
    setIsPlaying(false);
  }, [originalBuffer, stopSource]);

  useEffect(() => {
    if (!previewBuffer && activeSourceRef.current === "preview") {
      void switchSource("original");
    }
  }, [previewBuffer, switchSource]);

  useEffect(() => {
    return () => {
      stopSource();
    };
  }, [stopSource]);

  return {
    activeSource,
    currentTime,
    duration,
    isPlaying,
    canPlayOriginal,
    canPlayPreview,
    playPause,
    pause,
    seek,
    switchSource
  };
}

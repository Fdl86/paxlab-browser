import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  analyzeHeadroomSummary,
  formatDuration,
} from "../audio/audioBufferUtils";
import {
  buildWaveformRects,
  DEFAULT_WAVEFORM_HEIGHT,
  DEFAULT_WAVEFORM_SCALE_Y,
  DEFAULT_WAVEFORM_WIDTH,
  getCachedWaveformBins,
  type WaveformRect,
} from "../audio/waveformView";
import type {
  PlaybackSource,
  PreviewStatus,
  RealtimeMeterState,
} from "../audio/types";

interface RealtimeMonitorPanelProps {
  fileName: string | null;
  originalBuffer: AudioBuffer | null;
  previewBuffer: AudioBuffer | null;
  activeSource: PlaybackSource;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isSwitching: boolean;
  canUsePreview: boolean;
  previewStatus: PreviewStatus;
  previewRevision: number;
  previewRenderedAt: string | null;
  hasPendingChanges: boolean;
  meter: RealtimeMeterState;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
  onSwitchSource: (source: PlaybackSource) => void;
  onFileSelected?: (file: File) => void;
  equalVolume?: boolean;
  onToggleEqualVolume?: () => void;
}

const WAVEFORM_SEEK_THROTTLE_MS = 34;

function isSilentReading(value: number): boolean {
  return !Number.isFinite(value) || value <= -89;
}

function formatDb(value: number): string {
  if (isSilentReading(value)) {
    return "--";
  }

  return value.toFixed(1);
}

function formatLufs(value: number): string {
  if (isSilentReading(value)) {
    return "--";
  }

  return value.toFixed(1);
}

function TransportIcon({ type }: { type: "play" | "pause" | "stop" }) {
  if (type === "stop") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="4" y="4" width="8" height="8" rx="1.2" />
      </svg>
    );
  }

  if (type === "pause") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="4" y="3" width="3" height="10" rx="0.8" />
        <rect x="9" y="3" width="3" height="10" rx="0.8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5 3.8v8.4c0 .8.86 1.28 1.53.84l6.2-4.2a1 1 0 0 0 0-1.68l-6.2-4.2A1 1 0 0 0 5 3.8Z" />
    </svg>
  );
}

function EjectIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <polygon points="8,2 14,9 2,9" />
      <rect x="2" y="11" width="12" height="2.5" rx="1" />
    </svg>
  );
}

function meterLabel(status: RealtimeMeterState["status"]): string {
  if (status === "clipping") {
    return "Clipping";
  }

  if (status === "limited") {
    return "Limited";
  }

  if (status === "hot") {
    return "Hot";
  }

  if (status === "good") {
    return "Good";
  }

  return "Silence";
}

export function RealtimeMonitorPanel({
  fileName,
  originalBuffer,
  previewBuffer,
  activeSource,
  currentTime,
  duration,
  isPlaying,
  isSwitching,
  canUsePreview,
  previewStatus,
  previewRevision,
  previewRenderedAt,
  hasPendingChanges,
  meter,
  onPlayPause,
  onStop,
  onSeek,
  onSwitchSource,
  onFileSelected,
  equalVolume = false,
  onToggleEqualVolume,
}: RealtimeMonitorPanelProps) {
  const activeBuffer =
    activeSource === "preview"
      ? (previewBuffer ?? originalBuffer)
      : originalBuffer;
  const waveformBins = useMemo(
    () => getCachedWaveformBins(activeBuffer, originalBuffer),
    [activeBuffer, originalBuffer],
  );
  const headroomSummary = useMemo(
    () => (activeBuffer ? analyzeHeadroomSummary(activeBuffer) : null),
    [activeBuffer],
  );
  const progressRatio =
    duration > 0
      ? Math.min(1, Math.max(0, currentTime / duration))
      : 0;
  const waveformWidth = DEFAULT_WAVEFORM_WIDTH;
  const waveformHeight = DEFAULT_WAVEFORM_HEIGHT;
  const waveformCenterY = waveformHeight / 2;
  const waveformScaleY = DEFAULT_WAVEFORM_SCALE_Y;
  const playheadX = Math.min(
    waveformWidth,
    Math.max(0, progressRatio * waveformWidth),
  );
  const waveformRects = useMemo<WaveformRect[]>(
    () => buildWaveformRects(waveformBins, waveformWidth, waveformHeight, waveformScaleY),
    [waveformBins, waveformWidth, waveformHeight, waveformScaleY],
  );
  const activeHeadroom = headroomSummary
    ? headroomSummary.finalHeadroomDb
    : meter.headroomDb;
  const peakReadingIdle = isSilentReading(meter.peakHoldDb);
  const localLevelIdle = isSilentReading(meter.integratedLufsEstimate);
  const waveformDragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      waveformDragCleanupRef.current?.();
      waveformDragCleanupRef.current = null;
    };
  }, []);

  function handleFileChange(file: File | undefined) {
    if (!file || !onFileSelected) {
      return;
    }

    const fileName = file.name.toLowerCase();
    const isAudio =
      file.type.startsWith("audio/") ||
      [".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"].some(
        (extension) => fileName.endsWith(extension),
      );

    if (isAudio) {
      onFileSelected(file);
    }
  }


  function handleWaveformKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!activeBuffer || !duration || duration <= 0) {
      return;
    }

    const fineStep = event.shiftKey ? 10 : 5;
    let nextTime: number | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      nextTime = currentTime - fineStep;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      nextTime = currentTime + fineStep;
    } else if (event.key === "PageDown") {
      nextTime = currentTime - 30;
    } else if (event.key === "PageUp") {
      nextTime = currentTime + 30;
    } else if (event.key === "Home") {
      nextTime = 0;
    } else if (event.key === "End") {
      nextTime = duration;
    }

    if (nextTime === null) {
      return;
    }

    event.preventDefault();
    onSeek(Math.min(duration, Math.max(0, nextTime)));
  }

  function handleWaveformPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (!activeBuffer || !duration || duration <= 0) {
      return;
    }

    event.preventDefault();
    waveformDragCleanupRef.current?.();
    waveformDragCleanupRef.current = null;

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    let lastSeekAt = 0;

    function seekFromClientX(clientX: number, force = false) {
      const now = performance.now();

      if (isPlaying && !force && now - lastSeekAt < WAVEFORM_SEEK_THROTTLE_MS) {
        return;
      }

      const rect = target.getBoundingClientRect();

      if (rect.width <= 0) {
        return;
      }

      lastSeekAt = now;
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(ratio * duration);
    }

    seekFromClientX(event.clientX, true);

    if (target.setPointerCapture) {
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Pointer capture can fail if the pointer has already been released.
      }
    }

    function cleanup() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);

      if (target.hasPointerCapture?.(pointerId)) {
        try {
          target.releasePointerCapture(pointerId);
        } catch {
          // The browser may release pointer capture automatically.
        }
      }

      if (waveformDragCleanupRef.current === cleanup) {
        waveformDragCleanupRef.current = null;
      }
    }

    function handleMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }

      moveEvent.preventDefault();
      seekFromClientX(moveEvent.clientX);
    }

    function handleEnd(endEvent: PointerEvent) {
      if (endEvent.pointerId !== pointerId) {
        return;
      }

      seekFromClientX(endEvent.clientX, true);
      cleanup();
    }

    waveformDragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  }

  return (
    <section className="panel realtime-panel">
      <div className="ab-switch-block ab-control-bar">
        <div
          className="monitor-source-switch"
          aria-label="Choix de la source de lecture"
        >
          <button
            type="button"
            className={
              activeSource === "original"
                ? "monitor-source-button active"
                : "monitor-source-button"
            }
            disabled={!originalBuffer || isSwitching}
            onClick={() => onSwitchSource("original")}
          >
            Original
          </button>
          <button
            type="button"
            className={
              activeSource === "preview"
                ? "monitor-source-button active"
                : "monitor-source-button"
            }
            disabled={!canUsePreview || isSwitching}
            onClick={() => onSwitchSource("preview")}
          >
            Rendu PAXLAB
          </button>
        </div>

        {onToggleEqualVolume && (
          <label
            className={
              equalVolume
                ? "monitor-equal-toggle active top-equal-toggle"
                : "monitor-equal-toggle top-equal-toggle"
            }
            title="Compense le gain du rendu pour comparer à volume perçu identique."
          >
            <span>Volume égal</span>
            <input
              type="checkbox"
              checked={equalVolume}
              onChange={onToggleEqualVolume}
            />
          </label>
        )}

        <div className="transport-row compact-controls inline-transport-controls transport-icon-only">
          <button
            type="button"
            className="transport-button compact-transport primary-transport"
            disabled={isSwitching}
            onClick={() => onPlayPause()}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            <TransportIcon type={isPlaying ? "pause" : "play"} />
          </button>
          <button
            type="button"
            className="transport-button compact-transport"
            onClick={() => onStop()}
            aria-label="Stop"
          >
            <TransportIcon type="stop" />
          </button>
          {onFileSelected && (
            <label
              className="transport-button compact-transport change-track-control"
              aria-label="Éjecter / Changer de fichier"
            >
              <EjectIcon />
              <input
                type="file"
                accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.aiff,.aif"
                onChange={(event) => {
                  handleFileChange(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>

      {!activeBuffer && (
        <div className="empty-state small-empty-state">
          <p>Aucun signal à afficher.</p>
          <span>
            Importe un fichier audio pour activer le monitoring temps réel.
          </span>
        </div>
      )}

      {activeBuffer && (
        <>
          <div className="monitor-waveform">
            <div className="waveform-label-row">
              <div className="waveform-label-left">
                <span>
                  {activeSource === "preview"
                    ? "EN ÉCOUTE - Rendu PAXLAB"
                    : "EN ÉCOUTE - Original"}
                </span>
                <small>{fileName ?? "Aucun fichier audio chargé"}</small>
              </div>
              <strong className={isPlaying ? "live-pill live" : "live-pill"}>
                {isSwitching
                  ? "Commutation"
                  : isPlaying
                    ? "En lecture"
                    : "Pause"}
              </strong>
            </div>
            <div
              className="waveform-canvas bar-waveform-canvas"
              title="Clique, glisse ou utilise les flèches pour naviguer dans le morceau."
              role="slider"
              tabIndex={0}
              aria-label="Position de lecture"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${formatDuration(currentTime)} sur ${formatDuration(duration)}`}
              onKeyDown={handleWaveformKeyDown}
            >
              <svg
                className="bar-waveform-svg"
                viewBox={`0 0 ${waveformWidth} ${waveformHeight}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                onPointerDown={handleWaveformPointerDown}
              >
                <line
                  className="waveform-zero"
                  x1="0"
                  y1={waveformCenterY}
                  x2={waveformWidth}
                  y2={waveformCenterY}
                />
                <g className="waveform-layer waveform-layer-future">
                  {waveformRects.map((bar, index) => (
                    <rect
                      key={index}
                      className="waveform-bar waveform-bar-future"
                      x={bar.x.toFixed(2)}
                      y={bar.y.toFixed(2)}
                      width={bar.width.toFixed(2)}
                      height={bar.height.toFixed(2)}
                      rx="1.2"
                    />
                  ))}
                </g>
                <g className="waveform-layer waveform-layer-listened">
                  {waveformRects.map((bar, index) => {
                    if (playheadX <= bar.x) {
                      return null;
                    }

                    const listenedWidth = Math.min(
                      bar.width,
                      Math.max(0, playheadX - bar.x),
                    );

                    if (listenedWidth <= 0) {
                      return null;
                    }

                    return (
                      <rect
                        key={index}
                        className="waveform-bar waveform-bar-listened"
                        x={bar.x.toFixed(2)}
                        y={bar.y.toFixed(2)}
                        width={listenedWidth.toFixed(2)}
                        height={bar.height.toFixed(2)}
                        rx="1.2"
                      />
                    );
                  })}
                </g>
                <line
                  className="waveform-playhead-line"
                  x1={playheadX.toFixed(2)}
                  y1="0"
                  x2={playheadX.toFixed(2)}
                  y2={waveformHeight}
                />
              </svg>
            </div>
          </div>

          <div className="monitor-time-row">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>

          <div className="compact-meter-row">
            <div className="compact-meter-pill">
              <span>Peak lecture</span>
              <strong>{formatDb(meter.peakHoldDb)}</strong>
              <small>{peakReadingIdle ? "En attente de lecture" : "lecture courante"}</small>
            </div>
            <div className="compact-meter-pill">
              <span>Niveau local</span>
              <strong>{formatLufs(meter.integratedLufsEstimate)}</strong>
              <small>{localLevelIdle ? "En attente de lecture" : "court terme, pas LUFS intégré"}</small>
            </div>
            <div className="compact-meter-pill">
              <span>Marge peak</span>
              <strong>{activeHeadroom.toFixed(1)} dB</strong>
              <small>{meterLabel(meter.status)}</small>
            </div>
          </div>

        </>
      )}
    </section>
  );
}

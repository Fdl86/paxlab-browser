import { useMemo, type CSSProperties } from "react";
import {
  analyzeHeadroomSummary,
  formatDuration,
} from "../audio/audioBufferUtils";
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
  onOpenExport?: () => void;
  canOpenExport?: boolean;
  equalVolume?: boolean;
  onToggleEqualVolume?: () => void;
}

type WaveformViewMode = "structure" | "level";

function formatDb(value: number): string {
  if (!Number.isFinite(value) || value <= -89) {
    return "-inf";
  }

  return value.toFixed(1);
}

function formatLufs(value: number): string {
  if (!Number.isFinite(value) || value <= -89) {
    return "-inf";
  }

  return value.toFixed(1);
}

interface WaveformBin {
  min: number;
  max: number;
}

interface WaveformStatsBin {
  rms: number;
  peak: number;
}

const bufferIds = new WeakMap<AudioBuffer, number>();
const waveformCache = new WeakMap<AudioBuffer, Map<string, WaveformBin[]>>();
let nextBufferId = 1;

function getBufferId(buffer: AudioBuffer | null): number {
  if (!buffer) {
    return 0;
  }

  const existingId = bufferIds.get(buffer);
  if (existingId) {
    return existingId;
  }

  const newId = nextBufferId;
  nextBufferId += 1;
  bufferIds.set(buffer, newId);
  return newId;
}

function getAdaptiveBinCount(buffer: AudioBuffer | null): number {
  if (!buffer) {
    return 0;
  }

  const duration = buffer.duration;

  if (duration < 5) {
    return 160;
  }

  if (duration < 15) {
    return 220;
  }

  if (duration < 60) {
    return 320;
  }

  return 420;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (!sortedValues.length) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * ratio)),
  );

  return sortedValues[index] ?? 0;
}

function buildWaveformStats(
  buffer: AudioBuffer | null,
  bins = 420,
): WaveformStatsBin[] {
  if (!buffer || buffer.length <= 0) {
    return [];
  }

  const channelCount = buffer.numberOfChannels;
  const step = Math.max(1, Math.floor(buffer.length / bins));
  const waveformStats: WaveformStatsBin[] = [];

  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * step;
    const end = Math.min(buffer.length, start + step);
    let peak = 0;
    let sumSquares = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel);

      for (let index = start; index < end; index += 1) {
        const sample = data[index] ?? 0;
        const abs = Math.abs(sample);
        peak = Math.max(peak, abs);
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }

    waveformStats.push({
      rms: sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0,
      peak: Math.min(1, peak),
    });
  }

  return waveformStats;
}

function getReferenceRms(stats: WaveformStatsBin[]): number {
  const rmsValues = stats
    .map((item) => item.rms)
    .filter((value) => Number.isFinite(value) && value > 0.00001)
    .sort((a, b) => a - b);

  return Math.max(0.0008, percentile(rmsValues, 0.92));
}

function buildWaveformBins(
  buffer: AudioBuffer | null,
  referenceBuffer: AudioBuffer | null,
  mode: WaveformViewMode,
  bins = 420,
): WaveformBin[] {
  const activeStats = buildWaveformStats(buffer, bins);

  if (!activeStats.length) {
    return [];
  }

  const referenceStats =
    mode === "level"
      ? buildWaveformStats(referenceBuffer ?? buffer, bins)
      : activeStats;
  const referenceRms = getReferenceRms(
    referenceStats.length ? referenceStats : activeStats,
  );
  const waveformBins: WaveformBin[] = [];

  for (let index = 0; index < activeStats.length; index += 1) {
    const previous = activeStats[index - 1] ??
      activeStats[index] ?? { rms: 0, peak: 0 };
    const current = activeStats[index] ?? { rms: 0, peak: 0 };
    const next = activeStats[index + 1] ?? current;
    const smoothedRms =
      previous.rms * 0.18 + current.rms * 0.64 + next.rms * 0.18;
    const smoothedPeak =
      previous.peak * 0.12 + current.peak * 0.76 + next.peak * 0.12;

    // Dev08.4 : la waveform principale devient une vue de structure basée sur RMS.
    // Les pics gardent une petite influence, mais ne peuvent plus transformer un master limité en bloc visuel.
    const rmsBody =
      Math.pow(Math.min(3.2, smoothedRms / referenceRms), 0.72) * 0.42;
    const peakAccent =
      Math.pow(
        Math.min(3.8, smoothedPeak / Math.max(referenceRms * 2.8, 0.001)),
        0.48,
      ) * 0.12;
    const amplitude = Math.min(0.84, Math.max(0.012, rmsBody + peakAccent));

    waveformBins.push({
      min: -amplitude,
      max: amplitude,
    });
  }

  return waveformBins;
}

function pathFromWaveformBins(
  waveformBins: WaveformBin[],
  width = 860,
  height = 110,
): string {
  if (!waveformBins.length) {
    return "";
  }

  const center = height / 2;
  const scale = height * 0.46;
  const step = width / Math.max(1, waveformBins.length - 1);
  const top = waveformBins.map(
    (bin, index) =>
      `${index === 0 ? "M" : "L"}${(index * step).toFixed(2)},${(center - bin.max * scale).toFixed(2)}`,
  );
  const bottom = waveformBins
    .map(
      (bin, index) =>
        `L${((waveformBins.length - 1 - index) * step).toFixed(2)},${(center - bin.min * scale).toFixed(2)}`,
    )
    .join(" ");

  return `${top.join(" ")} ${bottom} Z`;
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
  const waveformBins = useMemo(() => {
    if (!activeBuffer) {
      return [];
    }

    const bins = getAdaptiveBinCount(activeBuffer);
    const referenceId = getBufferId(originalBuffer);
    const cacheKey = `structure:${bins}:${referenceId}`;
    const existingCache = waveformCache.get(activeBuffer);
    const cached = existingCache?.get(cacheKey);

    if (cached) {
      return cached;
    }

    const built = buildWaveformBins(
      activeBuffer,
      originalBuffer,
      "structure",
      bins,
    );
    const cache = existingCache ?? new Map<string, WaveformBin[]>();
    cache.set(cacheKey, built);
    waveformCache.set(activeBuffer, cache);
    return built;
  }, [activeBuffer, originalBuffer]);
  const headroomSummary = useMemo(
    () => (activeBuffer ? analyzeHeadroomSummary(activeBuffer) : null),
    [activeBuffer],
  );
  const progress =
    duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;
  const activeHeadroom = headroomSummary
    ? headroomSummary.finalHeadroomDb
    : meter.headroomDb;

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
          <div
            className="monitor-waveform"
            style={{ "--playhead": `${progress}%` } as CSSProperties}
          >
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
            <div className="waveform-canvas bar-waveform-canvas">
              <svg
                className="bar-waveform-svg"
                viewBox="0 0 860 110"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <line
                  className="waveform-zero"
                  x1="0"
                  y1="55"
                  x2="860"
                  y2="55"
                />
                {waveformBins.map((bin, index) => {
                  const center = 55;
                  const scale = 50;
                  const step = 860 / Math.max(1, waveformBins.length);
                  const barWidth = Math.max(1.2, Math.min(3.2, step * 0.52));
                  const amplitude = Math.max(
                    Math.abs(bin.max),
                    Math.abs(bin.min),
                  );
                  const barHeight = Math.max(6, amplitude * scale * 2);
                  const x = index * step + Math.max(0, (step - barWidth) / 2);
                  const y = center - barHeight / 2;

                  return (
                    <rect
                      key={index}
                      className="waveform-bar"
                      x={x.toFixed(2)}
                      y={y.toFixed(2)}
                      width={barWidth.toFixed(2)}
                      height={barHeight.toFixed(2)}
                      rx="1.2"
                    />
                  );
                })}
              </svg>
              <div className="playhead" />
            </div>
          </div>

          <div className="monitor-time-row">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>

          <input
            className="timeline monitor-timeline"
            type="range"
            min="0"
            max={Math.max(duration, 0)}
            step="0.01"
            value={Math.min(currentTime, duration || 0)}
            disabled={!activeBuffer || duration <= 0}
            onChange={(event) => onSeek(Number(event.target.value))}
            style={{ "--progress": `${progress}%` } as CSSProperties}
            aria-label="Position de lecture"
          />

          <div className="compact-meter-row">
            <div className="compact-meter-pill">
              <span>Peak lecture</span>
              <strong>{formatDb(meter.peakHoldDb)}</strong>
              <small>lecture courante</small>
            </div>
            <div className="compact-meter-pill">
              <span>Niveau local</span>
              <strong>{formatLufs(meter.integratedLufsEstimate)}</strong>
              <small>court terme, pas LUFS intégré</small>
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

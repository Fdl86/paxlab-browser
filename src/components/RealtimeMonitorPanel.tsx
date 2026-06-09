import { useMemo, type CSSProperties, type MouseEvent } from "react";
import { analyzeHeadroomSummary, formatDuration } from "../audio/audioBufferUtils";
import type { PlaybackSource, PreviewStatus, RealtimeMeterState } from "../audio/types";

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
    Math.max(0, Math.round((sortedValues.length - 1) * ratio))
  );

  return sortedValues[index] ?? 0;
}

function buildWaveformStats(buffer: AudioBuffer | null, bins = 420): WaveformStatsBin[] {
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
      peak: Math.min(1, peak)
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
  bins = 420
): WaveformBin[] {
  const activeStats = buildWaveformStats(buffer, bins);

  if (!activeStats.length) {
    return [];
  }

  const referenceStats = mode === "level" ? buildWaveformStats(referenceBuffer ?? buffer, bins) : activeStats;
  const referenceRms = getReferenceRms(referenceStats.length ? referenceStats : activeStats);
  const waveformBins: WaveformBin[] = [];

  for (let index = 0; index < activeStats.length; index += 1) {
    const previous = activeStats[index - 1] ?? activeStats[index] ?? { rms: 0, peak: 0 };
    const current = activeStats[index] ?? { rms: 0, peak: 0 };
    const next = activeStats[index + 1] ?? current;
    const smoothedRms = previous.rms * 0.18 + current.rms * 0.64 + next.rms * 0.18;
    const smoothedPeak = previous.peak * 0.12 + current.peak * 0.76 + next.peak * 0.12;

    // Dev08.4 : la waveform principale devient une vue de structure basée sur RMS.
    // Les pics gardent une petite influence, mais ne peuvent plus transformer un master limité en bloc visuel.
    const rmsBody = Math.pow(Math.min(3.2, smoothedRms / referenceRms), 0.72) * 0.42;
    const peakAccent = Math.pow(Math.min(3.8, smoothedPeak / Math.max(referenceRms * 2.8, 0.001)), 0.48) * 0.12;
    const amplitude = Math.min(0.84, Math.max(0.012, rmsBody + peakAccent));

    waveformBins.push({
      min: -amplitude,
      max: amplitude
    });
  }

  return waveformBins;
}

function pathFromWaveformBins(waveformBins: WaveformBin[], width = 860, height = 110): string {
  if (!waveformBins.length) {
    return "";
  }

  const center = height / 2;
  const scale = height * 0.46;
  const step = width / Math.max(1, waveformBins.length - 1);
  const top = waveformBins.map(
    (bin, index) =>
      `${index === 0 ? "M" : "L"}${(index * step).toFixed(2)},${(center - bin.max * scale).toFixed(2)}`
  );
  const bottom = waveformBins
    .map(
      (bin, index) =>
        `L${((waveformBins.length - 1 - index) * step).toFixed(2)},${(center - bin.min * scale).toFixed(2)}`
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

function ChangeFileIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 2.2a5.8 5.8 0 0 1 5.45 3.82.75.75 0 1 1-1.42.48A4.3 4.3 0 0 0 4.1 5.78l1.04-.02a.75.75 0 0 1 .03 1.5l-2.75.06a.75.75 0 0 1-.77-.73l-.06-2.75a.75.75 0 0 1 1.5-.03l.02.86A5.78 5.78 0 0 1 8 2.2Zm5.58 6.48a.75.75 0 0 1 .77.73l.06 2.75a.75.75 0 0 1-1.5.03l-.02-.86A5.8 5.8 0 0 1 2.55 9.98a.75.75 0 1 1 1.42-.48 4.3 4.3 0 0 0 7.93.72l-1.04.02a.75.75 0 0 1-.03-1.5l2.75-.06Z" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 2.2a.75.75 0 0 1 .75.75v5.08l1.74-1.74a.75.75 0 1 1 1.06 1.06l-3.02 3.02a.75.75 0 0 1-1.06 0L4.45 7.35a.75.75 0 1 1 1.06-1.06l1.74 1.74V2.95A.75.75 0 0 1 8 2.2ZM3.75 10.8a.75.75 0 0 1 .75.75v.95h7v-.95a.75.75 0 0 1 1.5 0v1.7a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75v-1.7a.75.75 0 0 1 .75-.75Z" />
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
  onOpenExport,
  canOpenExport = false
}: RealtimeMonitorPanelProps) {
  const activeBuffer = activeSource === "preview" ? previewBuffer ?? originalBuffer : originalBuffer;
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

    const built = buildWaveformBins(activeBuffer, originalBuffer, "structure", bins);
    const cache = existingCache ?? new Map<string, WaveformBin[]>();
    cache.set(cacheKey, built);
    waveformCache.set(activeBuffer, cache);
    return built;
  }, [activeBuffer, originalBuffer]);
  const path = useMemo(() => pathFromWaveformBins(waveformBins), [waveformBins]);
  const headroomSummary = useMemo(() => activeBuffer ? analyzeHeadroomSummary(activeBuffer) : null, [activeBuffer]);
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const activeHeadroom = headroomSummary ? headroomSummary.finalHeadroomDb : meter.headroomDb;
  const previewLabel = previewRevision > 0 ? `Preview #${previewRevision}` : "Preview";
  const previewInlineTime = previewRenderedAt ? `Version générée à ${previewRenderedAt}` : null;
  const nowPlayingLabel = activeSource === "original" ? "Original" : previewLabel;
  const previewStatusLabel =
    previewStatus === "rendering"
      ? "Rendu..."
      : previewStatus === "ready"
        ? hasPendingChanges
          ? `#${previewRevision} à régénérer`
          : `#${previewRevision}${previewRenderedAt ? ` · ${previewRenderedAt}` : ""}`
        : "Non générée";

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!duration) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  function handleFileChange(file: File | undefined) {
    if (!file || !onFileSelected) {
      return;
    }

    const fileName = file.name.toLowerCase();
    const isAudio = file.type.startsWith("audio/") || fileName.endsWith(".wav") || fileName.endsWith(".mp3");

    if (isAudio) {
      onFileSelected(file);
    }
  }

  return (
    <section className="panel realtime-panel">
      <div className="monitor-source-switch" aria-label="Choix de la source de lecture">
        <button
          type="button"
          className={activeSource === "original" ? "monitor-source-button active" : "monitor-source-button"}
          disabled={!originalBuffer || isSwitching}
          onClick={() => onSwitchSource("original")}
        >
          Original
        </button>
        <button
          type="button"
          className={activeSource === "preview" ? "monitor-source-button active" : "monitor-source-button"}
          disabled={!canUsePreview || isSwitching}
          onClick={() => onSwitchSource("preview")}
        >
          Preview
        </button>
        {onOpenExport && (
          <button
            type="button"
            className="monitor-export-button"
            disabled={!canOpenExport}
            onClick={onOpenExport}
          >
            <ExportIcon />
            Export
          </button>
        )}
      </div>

      <div className="now-playing-bar">
        <div>
          <p className="eyebrow">En écoute</p>
          <h2>
            {nowPlayingLabel}
            {activeSource === "preview" && previewInlineTime && (
              <small className="inline-render-time">{previewInlineTime}</small>
            )}
          </h2>
          <span>{fileName ?? "Aucun fichier audio chargé"}</span>
        </div>
        <strong className={isPlaying ? "live-pill live" : "live-pill"}>
          {isSwitching ? "Commutation" : isPlaying ? "En lecture" : "Pause"}
        </strong>
      </div>

      {!activeBuffer && (
        <div className="empty-state small-empty-state">
          <p>Aucun signal à afficher.</p>
          <span>Importe un fichier audio pour activer le monitoring temps réel.</span>
        </div>
      )}

      {activeBuffer && (
        <>
          <div className="monitor-waveform" onClick={handleClick} style={{ "--playhead": `${progress}%` } as CSSProperties}>
            <div className="waveform-label-row">
              <div className="waveform-label-left">
                <span>Écoute A/B</span>
                <small>Structure</small>
              </div>
              <div className="waveform-actions compact-controls">
                <button type="button" className="transport-button compact-transport" disabled={isSwitching} onClick={(event) => { event.stopPropagation(); onPlayPause(); }}>
                  <TransportIcon type={isPlaying ? "pause" : "play"} />
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button type="button" className="transport-button compact-transport" onClick={(event) => { event.stopPropagation(); onStop(); }}>
                  <TransportIcon type="stop" />
                  Stop
                </button>
                {onFileSelected && (
                  <label className="transport-button compact-transport change-track-control" onClick={(event) => event.stopPropagation()}>
                    <ChangeFileIcon />
                    Changer
                    <input
                      type="file"
                      accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3,.wav,.mp3"
                      onChange={(event) => handleFileChange(event.target.files?.[0])}
                    />
                  </label>
                )}
              </div>
            </div>
            <div className="waveform-canvas">
              <svg viewBox="0 0 860 110" preserveAspectRatio="none" aria-hidden="true">
                <line className="waveform-zero" x1="0" y1="55" x2="860" y2="55" />
                <path d={path} />
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
              <span>Peak</span>
              <strong>{formatDb(meter.peakHoldDb)}</strong>
              <small>dBTP est.</small>
            </div>
            <div className="compact-meter-pill">
              <span>LUFS estimé</span>
              <strong>{formatLufs(meter.integratedLufsEstimate)}</strong>
              <small>lecture courante</small>
            </div>
            <div className="compact-meter-pill">
              <span>Headroom</span>
              <strong>{activeHeadroom.toFixed(1)} dB</strong>
              <small>{meterLabel(meter.status)}</small>
            </div>
          </div>

          <div className="compact-now-playing-strip">
            <span>{nowPlayingLabel}</span>
            <span>{previewStatusLabel}</span>
            <strong className={`meter-status ${meter.status}`}>{meterLabel(meter.status)}</strong>
          </div>
        </>
      )}

      <p className="monitor-note">
        Lecture courante. Les mesures détaillées restent disponibles dans les accordéons techniques.
      </p>
    </section>
  );
}

import type { CSSProperties, MouseEvent } from "react";
import { formatDuration } from "../audio/audioBufferUtils";
import type { PlaybackSource, PreviewStatus, RealtimeMeterState } from "../audio/types";

interface RealtimeMonitorPanelProps {
  fileName: string | null;
  originalBuffer: AudioBuffer | null;
  previewBuffer: AudioBuffer | null;
  activeSource: PlaybackSource;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
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
}

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

function buildPeaks(buffer: AudioBuffer | null, bins = 340): number[] {
  if (!buffer || buffer.length <= 0) {
    return [];
  }

  const channelCount = buffer.numberOfChannels;
  const step = Math.max(1, Math.floor(buffer.length / bins));
  const peaks: number[] = [];

  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * step;
    const end = Math.min(buffer.length, start + step);
    let peak = 0;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = start; index < end; index += 1) {
        peak = Math.max(peak, Math.abs(data[index]));
      }
    }

    peaks.push(peak);
  }

  const maxPeak = Math.max(...peaks, 1e-6);
  return peaks.map((peak) => peak / maxPeak);
}

function pathFromPeaks(peaks: number[], width = 860, height = 110): string {
  if (!peaks.length) {
    return "";
  }

  const center = height / 2;
  const scale = height * 0.44;
  const step = width / Math.max(1, peaks.length - 1);
  const top = peaks.map(
    (peak, index) =>
      `${index === 0 ? "M" : "L"}${(index * step).toFixed(2)},${(center - peak * scale).toFixed(2)}`
  );
  const bottom = peaks
    .map(
      (peak, index) =>
        `L${((peaks.length - 1 - index) * step).toFixed(2)},${(center + peak * scale).toFixed(2)}`
    )
    .join(" ");

  return `${top.join(" ")} ${bottom} Z`;
}

function meterLabel(status: RealtimeMeterState["status"]): string {
  if (status === "clipping") {
    return "Clipping";
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
  canUsePreview,
  previewStatus,
  previewRevision,
  previewRenderedAt,
  hasPendingChanges,
  meter,
  onPlayPause,
  onStop,
  onSeek,
  onSwitchSource
}: RealtimeMonitorPanelProps) {
  const activeBuffer = activeSource === "preview" ? previewBuffer ?? originalBuffer : originalBuffer;
  const peaks = buildPeaks(activeBuffer);
  const path = pathFromPeaks(peaks);
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const outputPercent = Math.min(100, Math.max(0, ((meter.outputDb + 60) / 60) * 100));
  const peakPercent = Math.min(100, Math.max(0, ((meter.peakHoldDb + 60) / 60) * 100));
  const previewLabel = previewRevision > 0 ? `Preview Master #${previewRevision}` : "Preview Master";
  const nowPlayingLabel = activeSource === "original" ? "Original Source" : previewLabel;
  const previewStatusLabel =
    previewStatus === "rendering"
      ? "Rendu..."
      : previewStatus === "ready"
        ? hasPendingChanges
          ? `#${previewRevision} à régénérer`
          : `Prête #${previewRevision}`
        : "Non générée";

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!duration) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  return (
    <section className="panel realtime-panel">
      <div className="monitor-source-switch" aria-label="Choix de la source de lecture">
        <button
          type="button"
          className={activeSource === "original" ? "monitor-source-button active" : "monitor-source-button"}
          disabled={!originalBuffer}
          onClick={() => onSwitchSource("original")}
        >
          Original Source
        </button>
        <button
          type="button"
          className={activeSource === "preview" ? "monitor-source-button active" : "monitor-source-button"}
          disabled={!canUsePreview}
          onClick={() => onSwitchSource("preview")}
        >
          Preview Master
        </button>
      </div>

      <div className="now-playing-bar">
        <div>
          <p className="eyebrow">Lecture active</p>
          <h2>{nowPlayingLabel}</h2>
          <span>{fileName ?? "Aucun fichier audio chargé"}</span>
          {activeSource === "preview" && previewRenderedAt && (
            <small>Version générée à {previewRenderedAt}</small>
          )}
        </div>
        <strong className={isPlaying ? "live-pill live" : "live-pill"}>
          {isPlaying ? "En lecture" : "Pause"}
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
              <span>Waveform</span>
              <div className="waveform-actions">
                <button type="button" onClick={(event) => { event.stopPropagation(); onPlayPause(); }}>
                  {isPlaying ? "Pause" : "Play"}
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onStop(); }}>
                  Stop
                </button>
              </div>
            </div>
            <svg viewBox="0 0 860 110" preserveAspectRatio="none" aria-hidden="true">
              <path d={path} />
            </svg>
            <div className="playhead" />
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

          <div className="realtime-grid">
            <div className="meter-card primary-meter">
              <span>True Peak approx.</span>
              <strong>{formatDb(meter.peakHoldDb)}</strong>
              <small>dBTP est.</small>
            </div>
            <div className="meter-card primary-meter">
              <span>Integrated</span>
              <strong>{formatLufs(meter.integratedLufsEstimate)}</strong>
              <small>LUFS est.</small>
            </div>
            <div className="meter-card primary-meter">
              <span>Short-term</span>
              <strong>{formatLufs(meter.shortTermLufsEstimate)}</strong>
              <small>LUFS est.</small>
            </div>
            <div className="meter-card output-meter-card">
              <span>Output level</span>
              <div className="output-meter" style={{ "--output": `${outputPercent}%`, "--peak": `${peakPercent}%` } as CSSProperties}>
                <i />
                <b />
              </div>
              <small>Current : {formatDb(meter.outputDb)} dB</small>
            </div>
          </div>

          <div className="quality-strip">
            <div>
              <span>Status</span>
              <strong className={`meter-status ${meter.status}`}>{meterLabel(meter.status)}</strong>
            </div>
            <div>
              <span>Headroom</span>
              <strong>{meter.headroomDb.toFixed(1)} dB</strong>
            </div>
            <div>
              <span>Source</span>
              <strong>{nowPlayingLabel}</strong>
            </div>
            <div>
              <span>Preview</span>
              <strong>{previewStatusLabel}</strong>
            </div>
          </div>
        </>
      )}

      <p className="monitor-note">
        Indicateurs dynamiques estimés pendant l’écoute. Ils servent au pilotage A/B, pas à une certification LUFS officielle.
      </p>
    </section>
  );
}

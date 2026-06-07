import type { CSSProperties, MouseEvent } from "react";
import { formatDuration } from "../audio/audioBufferUtils";
import type { PlaybackSource } from "../audio/types";

interface WaveformPanelProps {
  originalBuffer: AudioBuffer | null;
  previewBuffer: AudioBuffer | null;
  activeSource: PlaybackSource;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
}

function buildPeaks(buffer: AudioBuffer | null, bins = 260): number[] {
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

function pathFromPeaks(peaks: number[], width = 760, height = 110): string {
  if (!peaks.length) {
    return "";
  }

  const center = height / 2;
  const scale = height * 0.44;
  const step = width / Math.max(1, peaks.length - 1);
  const top = peaks.map((peak, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(2)},${(center - peak * scale).toFixed(2)}`);
  const bottom = peaks
    .map((peak, index) => `L${((peaks.length - 1 - index) * step).toFixed(2)},${(center + peak * scale).toFixed(2)}`)
    .join(" ");

  return `${top.join(" ")} ${bottom} Z`;
}

export function WaveformPanel({
  originalBuffer,
  previewBuffer,
  activeSource,
  currentTime,
  duration,
  onSeek
}: WaveformPanelProps) {
  const activeBuffer = activeSource === "preview" ? previewBuffer ?? originalBuffer : originalBuffer;
  const peaks = buildPeaks(activeBuffer);
  const path = pathFromPeaks(peaks);
  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (!duration) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  }

  return (
    <section className="panel waveform-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Waveform</p>
          <h2>Vue d’ensemble cliquable</h2>
        </div>
        <span className="status-pill">{activeSource === "preview" ? "Preview" : "Original"}</span>
      </div>

      {!activeBuffer && (
        <div className="empty-state small-empty-state">
          <p>Aucun signal à afficher.</p>
          <span>Importe un fichier audio pour afficher la waveform.</span>
        </div>
      )}

      {activeBuffer && (
        <>
          <div
            className="waveform-box"
            role="button"
            tabIndex={0}
            onClick={handleClick}
            style={{ "--playhead": `${progress}%` } as CSSProperties}
          >
            <svg viewBox="0 0 760 110" preserveAspectRatio="none" aria-hidden="true">
              <path d={path} />
            </svg>
            <div className="playhead" />
          </div>

          <div className="waveform-time-row">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </>
      )}
    </section>
  );
}

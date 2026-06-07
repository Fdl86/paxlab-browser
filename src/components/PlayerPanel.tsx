import type { CSSProperties } from "react";
import { formatDuration } from "../audio/audioBufferUtils";
import type { PlaybackSource } from "../audio/types";

interface PlayerPanelProps {
  activeSource: PlaybackSource;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  canPlay: boolean;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
}

export function PlayerPanel({
  activeSource,
  currentTime,
  duration,
  isPlaying,
  canPlay,
  onPlayPause,
  onSeek
}: PlayerPanelProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <section className="panel player-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Lecteur local</p>
          <h2>Écoute synchronisée</h2>
        </div>
        <span className="status-pill">
          {activeSource === "original" ? "Original" : "Preview"}
        </span>
      </div>

      <div className="transport-row">
        <button
          className="play-button"
          type="button"
          disabled={!canPlay}
          onClick={onPlayPause}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <div className="time-display">
          <strong>{formatDuration(currentTime)}</strong>
          <span>/</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>

      <label className="timeline-label" htmlFor="timeline">
        Position de lecture
      </label>
      <input
        id="timeline"
        className="timeline"
        type="range"
        min="0"
        max={Math.max(duration, 0)}
        step="0.01"
        value={Math.min(currentTime, duration || 0)}
        disabled={!canPlay || duration <= 0}
        onChange={(event) => onSeek(Number(event.target.value))}
        style={{ "--progress": `${progress}%` } as CSSProperties}
      />

      {!canPlay && (
        <p className="message message-info">
          Importe un fichier audio pour activer le lecteur.
        </p>
      )}
    </section>
  );
}

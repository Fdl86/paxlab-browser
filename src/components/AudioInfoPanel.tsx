import {
  formatBytes,
  formatDuration,
  formatNumber
} from "../audio/audioBufferUtils";
import type { DecodedAudioInfo, DecodeStatus } from "../audio/types";

interface AudioInfoPanelProps {
  file: File | null;
  status: DecodeStatus;
  audioInfo: DecodedAudioInfo | null;
  errorMessage: string | null;
}

export function AudioInfoPanel({
  file,
  status,
  audioInfo,
  errorMessage
}: AudioInfoPanelProps) {
  return (
    <section className="panel info-panel">
      <div className="panel-heading">
        <p className="eyebrow">Informations audio</p>
        <h2>Lecture technique locale</h2>
      </div>

      {!file && (
        <div className="empty-state">
          <p>Aucun fichier sélectionné pour l’instant.</p>
          <span>
            Les informations apparaîtront ici après sélection d’un WAV ou MP3.
          </span>
        </div>
      )}

      {file && (
        <div className="info-grid">
          <div className="info-card">
            <span>Nom du fichier</span>
            <strong>{file.name}</strong>
          </div>

          <div className="info-card">
            <span>Taille</span>
            <strong>{formatBytes(file.size)}</strong>
          </div>

          <div className="info-card">
            <span>Type navigateur</span>
            <strong>{file.type || "Non renseigné"}</strong>
          </div>

          <div className="info-card">
            <span>Mode</span>
            <strong>Local navigateur</strong>
          </div>
        </div>
      )}

      {status === "loading" && (
        <p className="message message-info">
          Décodage Web Audio API en cours. Le fichier reste dans le navigateur.
        </p>
      )}

      {status === "error" && errorMessage && (
        <p className="message message-error">{errorMessage}</p>
      )}

      {status === "success" && audioInfo && (
        <>
          <div className="divider" />

          <div className="info-grid">
            <div className="info-card success">
              <span>Durée</span>
              <strong>{formatDuration(audioInfo.durationSeconds)}</strong>
            </div>

            <div className="info-card success">
              <span>Sample rate décodé</span>
              <strong>{formatNumber(audioInfo.sampleRate)} Hz</strong>
            </div>

            <div className="info-card success">
              <span>Canaux</span>
              <strong>{audioInfo.numberOfChannels}</strong>
            </div>

            <div className="info-card success">
              <span>Échantillons par canal</span>
              <strong>{formatNumber(audioInfo.length)}</strong>
            </div>
          </div>

          <p className="message message-success">
            Décodage réussi. Les mesures affichées sont indicatives et issues du
            décodage navigateur.
          </p>
        </>
      )}
    </section>
  );
}

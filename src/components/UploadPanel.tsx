import { useState } from "react";

interface UploadPanelProps {
  selectedFile: File | null;
  isDecoding: boolean;
  onFileSelected: (file: File) => void;
}

function isSupportedAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("audio/") ||
    [".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"].some((extension) =>
      name.endsWith(extension)
    )
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) {
    return "0 o";
  }

  const units = ["o", "Ko", "Mo", "Go"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unit;
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: value >= 10 ? 1 : 2 })} ${units[unit]}`;
}

export function UploadPanel({
  selectedFile,
  isDecoding,
  onFileSelected
}: UploadPanelProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [localWarning, setLocalWarning] = useState<string | null>(null);

  function handleFile(file: File | undefined) {
    setLocalWarning(null);

    if (!file) {
      return;
    }

    if (!isSupportedAudioFile(file)) {
      setLocalWarning("Format non reconnu. Essaie un WAV, MP3 ou un format audio compatible avec ton navigateur.");
      return;
    }

    onFileSelected(file);
  }

  return (
    <section className="panel upload-panel hero-upload-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Upload local</p>
          <h2>Dépose ton morceau</h2>
        </div>
        <span className="status-pill">Local</span>
      </div>

      <label
        className={`drop-zone hero-drop-zone ${isDragActive ? "drop-zone-active" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragActive(false);
          handleFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.aiff,.aif"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        <span className="drop-zone-icon" aria-hidden="true">↥</span>
        <span className="drop-zone-title">Glisse ton audio</span>
        <span className="drop-zone-subtitle">WAV, MP3 et formats audio compatibles navigateur. Aucun upload serveur.</span>
      </label>

      {localWarning && <p className="message message-warning">{localWarning}</p>}

      {selectedFile && (
        <div className="selected-file selected-file-pill">
          <span className="selected-file-label">Morceau chargé</span>
          <strong>{selectedFile.name}</strong>
          <small>{formatBytes(selectedFile.size)}</small>
        </div>
      )}

      {isDecoding && <p className="message message-info">Analyse locale en cours...</p>}
    </section>
  );
}

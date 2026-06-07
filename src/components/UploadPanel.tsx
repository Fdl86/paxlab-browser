import { useState } from "react";

interface UploadPanelProps {
  selectedFile: File | null;
  isDecoding: boolean;
  onFileSelected: (file: File) => void;
}

function isSupportedAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();

  return (
    name.endsWith(".wav") ||
    name.endsWith(".mp3") ||
    file.type === "audio/wav" ||
    file.type === "audio/x-wav" ||
    file.type === "audio/mpeg" ||
    file.type === "audio/mp3"
  );
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
      setLocalWarning("Format non prévu pour cette étape. Importe un WAV ou un MP3.");
      return;
    }

    onFileSelected(file);
  }

  return (
    <section className="panel upload-panel">
      <div className="panel-heading">
        <p className="eyebrow">Import local</p>
        <h2>Importer un WAV ou MP3</h2>
      </div>

      <label
        className={`drop-zone ${isDragActive ? "drop-zone-active" : ""}`}
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
          accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3,.wav,.mp3"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        <span className="drop-zone-title">
          Glisse un fichier ici ou clique pour sélectionner
        </span>
        <span className="drop-zone-subtitle">
          Décodage local via le navigateur. Aucun upload serveur.
        </span>
      </label>

      {localWarning && <p className="message message-warning">{localWarning}</p>}

      {selectedFile && (
        <div className="selected-file">
          <span className="selected-file-label">Fichier sélectionné</span>
          <strong>{selectedFile.name}</strong>
        </div>
      )}

      {isDecoding && (
        <p className="message message-info">Analyse locale du fichier en cours...</p>
      )}
    </section>
  );
}

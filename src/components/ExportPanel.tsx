import { useEffect, useRef, useState } from "react";
import { buildSafeAudioFilename, encodeWavFromAudioBuffer } from "../audio/exportWav";

interface ExportPanelProps {
  sourceFileName: string | null;
  previewBuffer: AudioBuffer | null;
  previewRevision: number;
  previewRenderedAt: string | null;
  hasPendingChanges: boolean;
  isRendering: boolean;
  onBeforeExport: () => void;
}

export function ExportPanel({
  sourceFileName,
  previewBuffer,
  previewRevision,
  previewRenderedAt,
  hasPendingChanges,
  isRendering,
  onBeforeExport
}: ExportPanelProps) {
  const [lastExportName, setLastExportName] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function handleExport(bitDepth: 16 | 24) {
    if (!previewBuffer || hasPendingChanges || isRendering) {
      return;
    }

    onBeforeExport();

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }

    const suffix = `preview-master-${previewRevision || 1}-${bitDepth}bit`;
    const filename = buildSafeAudioFilename(sourceFileName, suffix);
    const blob = encodeWavFromAudioBuffer(previewBuffer, { bitDepth });
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setLastExportName(filename);
  }

  const canExport = Boolean(previewBuffer) && !hasPendingChanges && !isRendering;

  return (
    <section className="panel export-panel">
      <div className="panel-heading">
        <p className="eyebrow">Export local</p>
        <h2>Récupérer la Preview validée</h2>
      </div>

      <div className="export-status-card">
        <span>Version exportable</span>
        <strong>
          {previewBuffer
            ? `Preview Master #${previewRevision}${previewRenderedAt ? ` · ${previewRenderedAt}` : ""}`
            : "Aucune Preview"}
        </strong>
        <p>
          Export WAV généré localement depuis la Preview en mémoire. Aucun serveur, aucun upload,
          aucune promesse de master final.
        </p>
      </div>

      <div className="export-actions">
        <button type="button" disabled={!canExport} onClick={() => handleExport(24)}>
          Exporter WAV 24-bit
          <small>Conseillé avant Audacity</small>
        </button>

        <button type="button" disabled={!canExport} onClick={() => handleExport(16)}>
          Exporter WAV 16-bit
          <small>Compatibilité maximale</small>
        </button>
      </div>

      {!previewBuffer && (
        <p className="message message-info">Génère d’abord une Preview Master pour activer l’export local.</p>
      )}

      {hasPendingChanges && previewBuffer && (
        <p className="message message-warning">
          Réglages modifiés. Régénère la Preview avant export pour éviter d’exporter une ancienne version.
        </p>
      )}

      {lastExportName && !hasPendingChanges && (
        <p className="message message-success">Fichier préparé : {lastExportName}</p>
      )}
    </section>
  );
}

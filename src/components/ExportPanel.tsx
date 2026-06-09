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
  const [showOptions, setShowOptions] = useState(false);
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

    const suffix = `paxlab-preview-${previewRevision || 1}-${bitDepth}bit`;
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
    <section className="panel export-panel simple-export-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Étape finale</p>
          <h2>Exporter la Preview</h2>
        </div>
        <span className={canExport ? "status-pill ready-pill" : "status-pill"}>{canExport ? "Prêt à exporter" : previewBuffer ? "À régénérer" : "Preview requise"}</span>
      </div>

      <div className="export-status-card export-summary-card">
        <span>Version exportable</span>
        <strong>
          {previewBuffer
            ? `Preview #${previewRevision}${previewRenderedAt ? ` · ${previewRenderedAt}` : ""}`
            : "Aucune Preview"}
        </strong>
        <p>Export local depuis la Preview validée. Aucun upload, aucun serveur.</p>
      </div>

      <button
        type="button"
        className="primary-button export-main-button"
        disabled={!canExport}
        onClick={() => handleExport(24)}
      >
        Télécharger WAV 24-bit
        <small>Export local conseillé avant Audacity ou archivage</small>
      </button>

      <button type="button" className="plain-link-button" onClick={() => setShowOptions((value) => !value)}>
        {showOptions ? "Masquer l’option 16-bit" : "Option WAV 16-bit"}
      </button>

      {showOptions && (
        <div className="export-actions compact-export-actions">
          <button type="button" disabled={!canExport} onClick={() => handleExport(16)}>
            Exporter WAV 16-bit
            <small>Compatibilité maximale</small>
          </button>
        </div>
      )}

      {!previewBuffer && (
        <p className="message message-info">Génère d’abord une Preview pour activer l’export.</p>
      )}

      {hasPendingChanges && previewBuffer && (
        <p className="message message-warning">Réglages modifiés. Régénère la Preview avant export.</p>
      )}

      {lastExportName && !hasPendingChanges && (
        <p className="message message-success">Fichier préparé : {lastExportName}</p>
      )}
    </section>
  );
}

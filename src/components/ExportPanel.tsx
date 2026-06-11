import { useEffect, useMemo, useRef, useState } from "react";
import { buildSafeAudioFilename, encodeWavFromAudioBuffer } from "../audio/exportWav";

interface ExportPanelProps {
  sourceFileName: string | null;
  previewBuffer: AudioBuffer | null;
  previewRevision: number;
  previewRenderedAt: string | null;
  hasPendingChanges: boolean;
  isRendering: boolean;
  onBeforeExport: () => void;
  onExported?: () => void;
}

function sanitizeWavFilename(value: string): string {
  const trimmed = value.trim();
  const withExtension = trimmed.toLowerCase().endsWith(".wav") ? trimmed : `${trimmed}.wav`;
  const safe = withExtension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safe || "paxlab-preview.wav";
}

export function ExportPanel({
  sourceFileName,
  previewBuffer,
  previewRevision,
  previewRenderedAt,
  hasPendingChanges,
  isRendering,
  onBeforeExport,
  onExported
}: ExportPanelProps) {
  const [lastExportName, setLastExportName] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const suggestedFilename = useMemo(() => {
    const suffix = `paxlab-preview-${previewRevision || 1}-24bit`;
    return buildSafeAudioFilename(sourceFileName, suffix);
  }, [previewRevision, sourceFileName]);
  const [exportFilename, setExportFilename] = useState(suggestedFilename);

  useEffect(() => {
    setExportFilename(suggestedFilename);
  }, [suggestedFilename]);

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

    const fallbackSuffix = `paxlab-preview-${previewRevision || 1}-${bitDepth}bit`;
    const fallbackName = buildSafeAudioFilename(sourceFileName, fallbackSuffix);
    const customName = sanitizeWavFilename(
      bitDepth === 24 ? exportFilename || fallbackName : exportFilename.replace(/24bit/i, "16bit") || fallbackName
    );
    const filename = bitDepth === 16 && !customName.toLowerCase().includes("16bit")
      ? customName.replace(/\.wav$/i, "-16bit.wav")
      : customName;
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
    onExported?.();
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

      <label className="export-filename-field">
        <span>Nom du fichier exporté</span>
        <input
          type="text"
          value={exportFilename}
          disabled={!previewBuffer || isRendering}
          onChange={(event) => setExportFilename(event.target.value)}
          onBlur={() => setExportFilename((value) => sanitizeWavFilename(value || suggestedFilename))}
        />
      </label>

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

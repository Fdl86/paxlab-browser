import { useEffect, useMemo, useRef, useState } from "react";
import { encodeFlacFromAudioBuffer } from "../audio/exportFlac";
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

type ExportFormat = "wav" | "flac";

function sanitizeAudioFilename(value: string, extension: ExportFormat): string {
  const trimmed = value.trim();
  const withoutKnownExtension = trimmed.replace(/\.(wav|flac)$/i, "");
  const safeBase = withoutKnownExtension
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeBase || "paxlab-preview"}.${extension}`;
}

function buildCustomExportName(baseName: string, fallbackName: string, extension: ExportFormat, bitDepth: 16 | 24): string {
  const sourceName = baseName || fallbackName;
  const withBitDepth = bitDepth === 16 ? sourceName.replace(/24bit/i, "16bit") : sourceName;
  const sanitized = sanitizeAudioFilename(withBitDepth, extension);

  if (bitDepth === 16 && !sanitized.toLowerCase().includes("16bit")) {
    return sanitized.replace(new RegExp(`\\.${extension}$`, "i"), `-16bit.${extension}`);
  }

  return sanitized;
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
  const [isPreparingFlac, setIsPreparingFlac] = useState(false);
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

  function downloadBlob(blob: Blob, filename: string) {
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

  function prepareExport() {
    if (!previewBuffer || hasPendingChanges || isRendering) {
      return false;
    }

    onBeforeExport();

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    return true;
  }

  function handleWavExport(bitDepth: 16 | 24) {
    if (!previewBuffer || !prepareExport()) {
      return;
    }

    const fallbackSuffix = `paxlab-preview-${previewRevision || 1}-${bitDepth}bit`;
    const fallbackName = buildSafeAudioFilename(sourceFileName, fallbackSuffix, "wav");
    const filename = buildCustomExportName(exportFilename, fallbackName, "wav", bitDepth);
    const blob = encodeWavFromAudioBuffer(previewBuffer, { bitDepth });
    downloadBlob(blob, filename);
  }

  async function handleFlacExport() {
    if (!previewBuffer || !prepareExport()) {
      return;
    }

    setIsPreparingFlac(true);

    try {
      const fallbackSuffix = `paxlab-preview-${previewRevision || 1}-24bit`;
      const fallbackName = buildSafeAudioFilename(sourceFileName, fallbackSuffix, "flac");
      const filename = buildCustomExportName(exportFilename, fallbackName, "flac", 24);
      const blob = await encodeFlacFromAudioBuffer(previewBuffer, { bitDepth: 24, compression: 5 });
      downloadBlob(blob, filename);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export FLAC indisponible, utilise WAV 24-bit.";
      setLastExportName(message);
    } finally {
      setIsPreparingFlac(false);
    }
  }

  const canExport = Boolean(previewBuffer) && !hasPendingChanges && !isRendering && !isPreparingFlac;

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
        <p>Export local WAV ou FLAC depuis la Preview validée. Aucun upload, aucun serveur.</p>
      </div>

      <label className="export-filename-field">
        <span>Nom du fichier exporté</span>
        <input
          type="text"
          value={exportFilename}
          disabled={!previewBuffer || isRendering}
          onChange={(event) => setExportFilename(event.target.value)}
          onBlur={() => setExportFilename((value) => sanitizeAudioFilename(value || suggestedFilename, "wav"))}
        />
      </label>

      <div className="export-primary-actions">
        <button
          type="button"
          className="primary-button export-main-button"
          disabled={!canExport}
          onClick={() => handleWavExport(24)}
        >
          Télécharger WAV 24-bit
          <small>Export local conseillé avant Audacity ou archivage</small>
        </button>

        <button
          type="button"
          className="secondary-button export-main-button flac-export-button"
          disabled={!canExport}
          onClick={handleFlacExport}
        >
          {isPreparingFlac ? "Préparation FLAC..." : "Télécharger FLAC 24-bit"}
          <small>Compression libFLAC locale, lossless 24-bit</small>
        </button>
      </div>

      <button type="button" className="plain-link-button" onClick={() => setShowOptions((value) => !value)}>
        {showOptions ? "Masquer l’option 16-bit" : "Option WAV 16-bit"}
      </button>

      {showOptions && (
        <div className="export-actions compact-export-actions">
          <button type="button" disabled={!canExport} onClick={() => handleWavExport(16)}>
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

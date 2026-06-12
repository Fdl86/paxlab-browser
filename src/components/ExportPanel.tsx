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
type ExportChoiceId = "flac24" | "wav24" | "wav16";

const EXPORT_CHOICES: Array<{
  id: ExportChoiceId;
  title: string;
  help: string;
  format: ExportFormat;
  bitDepth: 16 | 24;
  recommended?: boolean;
}> = [
  {
    id: "flac24",
    title: "FLAC 24-bit",
    help: "Lossless compressé - YouTube",
    format: "flac",
    bitDepth: 24,
    recommended: true
  },
  {
    id: "wav24",
    title: "WAV 24-bit",
    help: "Référence Audacity / archive",
    format: "wav",
    bitDepth: 24
  },
  {
    id: "wav16",
    title: "WAV 16-bit",
    help: "Compatibilité maximale",
    format: "wav",
    bitDepth: 16
  }
];

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

  if (bitDepth === 24 && !sanitized.toLowerCase().includes("24bit")) {
    return sanitized.replace(new RegExp(`\\.${extension}$`, "i"), `-24bit.${extension}`);
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
  const [selectedChoice, setSelectedChoice] = useState<ExportChoiceId>("flac24");
  const [isPreparingFlac, setIsPreparingFlac] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const selectedExport = EXPORT_CHOICES.find((choice) => choice.id === selectedChoice) ?? EXPORT_CHOICES[0];
  const suggestedFilename = useMemo(() => {
    const suffix = `paxlab-preview-${previewRevision || 1}-24bit`;
    return buildSafeAudioFilename(sourceFileName, suffix, selectedExport.format);
  }, [previewRevision, selectedExport.format, sourceFileName]);
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

  function handleSelectedExport() {
    if (selectedExport.id === "flac24") {
      void handleFlacExport();
      return;
    }

    handleWavExport(selectedExport.bitDepth);
  }

  const canExport = Boolean(previewBuffer) && !hasPendingChanges && !isRendering && !isPreparingFlac;
  const buttonLabel = selectedExport.id === "flac24" && isPreparingFlac
    ? "Préparation FLAC..."
    : `Télécharger ${selectedExport.title}`;

  return (
    <section className="panel export-panel simple-export-panel premium-export-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Action principale</p>
          <h2>Exporter la Preview</h2>
        </div>
        <span className={canExport ? "status-pill ready-pill" : "status-pill"}>{canExport ? "Prêt" : previewBuffer ? "À régénérer" : "Preview requise"}</span>
      </div>

      <div className="export-status-card export-summary-card premium-export-summary">
        <span>Version exportable</span>
        <strong>
          {previewBuffer
            ? `Preview #${previewRevision}${previewRenderedAt ? ` · ${previewRenderedAt}` : ""}`
            : "Aucune Preview"}
        </strong>
        <p>Choisis le format final local. Aucun upload, aucun serveur.</p>
      </div>

      <div className="export-choice-stack" aria-label="Format export">
        {EXPORT_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={selectedChoice === choice.id ? "export-choice-card active" : "export-choice-card"}
            aria-pressed={selectedChoice === choice.id}
            disabled={!previewBuffer || isRendering || isPreparingFlac}
            onClick={() => setSelectedChoice(choice.id)}
          >
            <span className="export-radio" aria-hidden="true" />
            <span className="export-choice-copy">
              <strong>{choice.title}</strong>
              <small>{choice.help}</small>
            </span>
            {choice.recommended && <em>Recommandé</em>}
          </button>
        ))}
      </div>

      <label className="export-filename-field premium-export-filename">
        <span>Nom du fichier exporté</span>
        <input
          type="text"
          value={exportFilename}
          disabled={!previewBuffer || isRendering || isPreparingFlac}
          onChange={(event) => setExportFilename(event.target.value)}
          onBlur={() => setExportFilename((value) => sanitizeAudioFilename(value || suggestedFilename, selectedExport.format))}
        />
      </label>

      <button
        type="button"
        className="primary-button export-main-button premium-download-button"
        disabled={!canExport}
        onClick={handleSelectedExport}
      >
        {buttonLabel}
        <small>Export local, aucun upload, Preview à jour</small>
      </button>

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

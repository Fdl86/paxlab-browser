import { useEffect, useMemo, useRef, useState } from "react";
import { encodeFlacFromAudioBuffer } from "../audio/exportFlac";
import {
  buildSafeAudioFilename,
  encodeWavFromAudioBuffer,
} from "../audio/exportWav";

interface ExportPanelProps {
  sourceFileName: string | null;
  previewBuffer: AudioBuffer | null;
  previewRevision: number;
  previewRenderedAt: string | null;
  hasPendingChanges: boolean;
  isRendering: boolean;
  onBeforeExport: () => void;
  onExported?: () => void;
  onRegenerateRequest?: () => void;
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
    recommended: true,
  },
  {
    id: "wav24",
    title: "WAV 24-bit",
    help: "Référence Audacity / archive",
    format: "wav",
    bitDepth: 24,
  },
  {
    id: "wav16",
    title: "WAV 16-bit",
    help: "Compatibilité maximale",
    format: "wav",
    bitDepth: 16,
  },
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

function buildCustomExportName(
  baseName: string,
  fallbackName: string,
  extension: ExportFormat,
  bitDepth: 16 | 24,
): string {
  const sourceName = baseName || fallbackName;
  const withBitDepth =
    bitDepth === 16 ? sourceName.replace(/24bit/i, "16bit") : sourceName;
  const sanitized = sanitizeAudioFilename(withBitDepth, extension);

  if (bitDepth === 16 && !sanitized.toLowerCase().includes("16bit")) {
    return sanitized.replace(
      new RegExp(`\\.${extension}$`, "i"),
      `-16bit.${extension}`,
    );
  }

  if (bitDepth === 24 && !sanitized.toLowerCase().includes("24bit")) {
    return sanitized.replace(
      new RegExp(`\\.${extension}$`, "i"),
      `-24bit.${extension}`,
    );
  }

  return sanitized;
}

function buildDefaultExportFilename(
  sourceFileName: string | null,
  previewRevision: number,
  extension: ExportFormat,
): string {
  const suffix = `paxlab-preview-${previewRevision || 1}-24bit`;
  return buildSafeAudioFilename(sourceFileName, suffix, extension);
}

export function ExportPanel({
  sourceFileName,
  previewBuffer,
  previewRevision,
  previewRenderedAt,
  hasPendingChanges,
  isRendering,
  onBeforeExport,
  onExported,
  onRegenerateRequest,
}: ExportPanelProps) {
  const [lastExportName, setLastExportName] = useState<string | null>(null);
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null);
  const [selectedChoice, setSelectedChoice] =
    useState<ExportChoiceId>("flac24");
  const [isPreparingFlac, setIsPreparingFlac] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const selectedExport =
    EXPORT_CHOICES.find((choice) => choice.id === selectedChoice) ??
    EXPORT_CHOICES[0];
  const [exportFilename, setExportFilename] = useState(() =>
    buildDefaultExportFilename(sourceFileName, previewRevision, "flac"),
  );

  useEffect(() => {
    setExportFilename(
      buildDefaultExportFilename(sourceFileName, previewRevision, selectedExport.format),
    );
    // Intentionally reset only when the Preview changes. Changing FLAC/WAV keeps the typed name;
    // the final extension is normalized at download time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewRevision, sourceFileName]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  function downloadBlob(blob: Blob, filename: string) {
    const previousObjectUrl = objectUrlRef.current;
    const objectUrl = URL.createObjectURL(blob);
    objectUrlRef.current = objectUrl;

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    if (previousObjectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(previousObjectUrl), 30000);
    }

    setExportErrorMessage(null);
    setLastExportName(filename);
    onExported?.();
  }

  function prepareExport() {
    if (!previewBuffer || hasPendingChanges || isRendering) {
      return false;
    }

    setExportErrorMessage(null);
    onBeforeExport();

    return true;
  }

  function handleWavExport(bitDepth: 16 | 24) {
    if (!previewBuffer || !prepareExport()) {
      return;
    }

    const fallbackSuffix = `paxlab-preview-${previewRevision || 1}-${bitDepth}bit`;
    const fallbackName = buildSafeAudioFilename(
      sourceFileName,
      fallbackSuffix,
      "wav",
    );
    const filename = buildCustomExportName(
      exportFilename,
      fallbackName,
      "wav",
      bitDepth,
    );
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
      const fallbackName = buildSafeAudioFilename(
        sourceFileName,
        fallbackSuffix,
        "flac",
      );
      const filename = buildCustomExportName(
        exportFilename,
        fallbackName,
        "flac",
        24,
      );
      const blob = await encodeFlacFromAudioBuffer(previewBuffer, {
        bitDepth: 24,
        compression: 5,
      });
      downloadBlob(blob, filename);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Export FLAC indisponible, utilise WAV 24-bit.";
      setExportErrorMessage(message);
      setLastExportName(null);
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

  const canExport =
    Boolean(previewBuffer) &&
    !hasPendingChanges &&
    !isRendering &&
    !isPreparingFlac;
  const buttonLabel =
    selectedExport.id === "flac24" && isPreparingFlac
      ? "Encodage FLAC local..."
      : `Exporter ${selectedExport.title}`;

  return (
    <section className="panel export-panel simple-export-panel premium-export-panel">
      <div className="panel-heading compact-heading compact-export-heading">
        <div>
          <h2>
            {previewBuffer
              ? `Exporter la Preview sélectionnée #${previewRevision}${previewRenderedAt ? ` - ${previewRenderedAt}` : ""}`
              : "Exporter le rendu"}
          </h2>
        </div>
        {previewBuffer && hasPendingChanges && onRegenerateRequest ? (
          <button
            type="button"
            className="status-pill status-pill-button"
            onClick={onRegenerateRequest}
            title="Régénérer la Preview avec les réglages actuels."
          >
            À régénérer
          </button>
        ) : (
          <span className={canExport ? "status-pill ready-pill" : "status-pill"}>
            {canExport ? "Prêt" : previewBuffer ? "À régénérer" : "Preview requise"}
          </span>
        )}
      </div>

      <div
        className="export-choice-stack export-choice-row"
        aria-label="Format export"
      >
        {EXPORT_CHOICES.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={
              selectedChoice === choice.id
                ? "export-choice-card active"
                : "export-choice-card"
            }
            aria-pressed={selectedChoice === choice.id}
            disabled={!previewBuffer || isRendering || isPreparingFlac}
            onClick={() => setSelectedChoice(choice.id)}
          >
            <span className="export-radio" aria-hidden="true" />
            <span className="export-choice-copy">
              <strong>{choice.title}</strong>
            </span>
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
        />
      </label>

      <button
        type="button"
        className="primary-button export-main-button premium-download-button"
        disabled={!canExport}
        onClick={handleSelectedExport}
        aria-busy={isPreparingFlac}
      >
        {buttonLabel}
        <small>{isPreparingFlac ? "Encodage lossless local en cours" : "Local - Aucun upload - Preview à jour"}</small>
      </button>

      {!previewBuffer && (
        <p className="message message-info">
          Génère d’abord une Preview pour activer l’export.
        </p>
      )}

      {hasPendingChanges && previewBuffer && (
        <p className="message message-warning export-action-warning">
          Réglages modifiés. Régénère la Preview avant export.
          {onRegenerateRequest && (
            <button type="button" onClick={onRegenerateRequest}>
              Ouvrir les réglages
            </button>
          )}
        </p>
      )}

      {exportErrorMessage && (
        <p className="message message-error">{exportErrorMessage}</p>
      )}

      {lastExportName && !hasPendingChanges && !exportErrorMessage && (
        <p className="message message-success">
          Fichier préparé : {lastExportName}
        </p>
      )}
    </section>
  );
}

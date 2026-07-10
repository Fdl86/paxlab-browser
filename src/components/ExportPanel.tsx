import { useEffect, useRef, useState } from "react";
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

interface ExportJobState {
  title: string;
  detail: string;
}

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
  const sourceName = (baseName || fallbackName).trim();
  const withoutKnownExtension = sourceName.replace(/\.(wav|flac)$/i, "");
  const withoutBitDepth = withoutKnownExtension.replace(/[-_\s]*(16|24)bit$/i, "");
  const withBitDepth = `${withoutBitDepth || "paxlab-preview"}-${bitDepth}bit.${extension}`;

  return sanitizeAudioFilename(withBitDepth, extension);
}

function buildDefaultExportFilename(
  sourceFileName: string | null,
  previewRevision: number,
  extension: ExportFormat,
  bitDepth: 16 | 24 = 24,
): string {
  const suffix = `paxlab-preview-${previewRevision || 1}-${bitDepth}bit`;
  return buildSafeAudioFilename(sourceFileName, suffix, extension);
}

function waitForExportFeedback(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 90);
    });
  });
}

function assertWavExport(blob: Blob, buffer: AudioBuffer, bitDepth: 16 | 24): void {
  const expectedSize = 44 + buffer.length * buffer.numberOfChannels * (bitDepth / 8);

  if (blob.type !== "audio/wav" || blob.size !== expectedSize) {
    throw new Error("Validation WAV échouée. Aucun fichier incomplet n'a été téléchargé.");
  }
}

async function assertFlacExport(blob: Blob): Promise<void> {
  if (blob.size < 42) {
    throw new Error("Validation FLAC échouée. Le fichier encodé est incomplet.");
  }

  const header = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const isNativeFlac =
    header[0] === 0x66 &&
    header[1] === 0x4c &&
    header[2] === 0x61 &&
    header[3] === 0x43;

  if (!isNativeFlac) {
    throw new Error("Validation FLAC échouée. Signature du fichier invalide.");
  }
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
  const [exportJob, setExportJob] = useState<ExportJobState | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const exportInFlightRef = useRef(false);
  const exportGenerationRef = useRef(0);
  const selectedExport =
    EXPORT_CHOICES.find((choice) => choice.id === selectedChoice) ??
    EXPORT_CHOICES[0];
  const [exportFilename, setExportFilename] = useState(() =>
    buildDefaultExportFilename(sourceFileName, previewRevision, "flac"),
  );

  useEffect(() => {
    exportGenerationRef.current += 1;
    setExportFilename(
      buildDefaultExportFilename(
        sourceFileName,
        previewRevision,
        selectedExport.format,
        selectedExport.bitDepth,
      ),
    );
    setLastExportName(null);
    setExportErrorMessage(null);
    // Intentionally reset only when the Preview changes. Changing FLAC/WAV is handled separately
    // so the visible filename extension stays aligned with the selected format.
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

  async function beginExportFeedback(choice: typeof EXPORT_CHOICES[number]) {
    if (
      !previewBuffer ||
      hasPendingChanges ||
      isRendering ||
      exportJob ||
      exportInFlightRef.current
    ) {
      return false;
    }

    exportInFlightRef.current = true;
    setExportErrorMessage(null);
    setLastExportName(null);
    onBeforeExport();
    setExportJob({
      title: choice.format === "flac" ? "Encodage FLAC local" : "Préparation WAV locale",
      detail:
        choice.format === "flac"
          ? "Préparation du fichier lossless. Aucun upload."
          : "Préparation du fichier local. Aucun upload.",
    });
    await waitForExportFeedback();

    return true;
  }

  async function handleWavExport(bitDepth: 16 | 24) {
    if (!previewBuffer) {
      return;
    }

    const choice = EXPORT_CHOICES.find(
      (candidate) => candidate.format === "wav" && candidate.bitDepth === bitDepth,
    ) ?? selectedExport;

    if (!(await beginExportFeedback(choice))) {
      return;
    }

    const exportGeneration = exportGenerationRef.current;

    try {
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
      assertWavExport(blob, previewBuffer, bitDepth);

      if (exportGeneration !== exportGenerationRef.current) {
        throw new Error("Le rendu a changé pendant l'export. Relance l'export du rendu actuel.");
      }

      downloadBlob(blob, filename);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Export WAV indisponible.";
      setExportErrorMessage(message);
      setLastExportName(null);
    } finally {
      exportInFlightRef.current = false;
      setExportJob(null);
    }
  }

  async function handleFlacExport() {
    if (!previewBuffer) {
      return;
    }

    if (!(await beginExportFeedback(EXPORT_CHOICES[0]))) {
      return;
    }

    const exportGeneration = exportGenerationRef.current;

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
      await assertFlacExport(blob);

      if (exportGeneration !== exportGenerationRef.current) {
        throw new Error("Le rendu a changé pendant l'export. Relance l'export du rendu actuel.");
      }

      downloadBlob(blob, filename);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Export FLAC indisponible, utilise WAV 24-bit.";
      setExportErrorMessage(message);
      setLastExportName(null);
    } finally {
      exportInFlightRef.current = false;
      setExportJob(null);
    }
  }

  function handleSelectedExport() {
    if (selectedExport.id === "flac24") {
      void handleFlacExport();
      return;
    }

    void handleWavExport(selectedExport.bitDepth);
  }

  function handleExportChoiceChange(choice: typeof EXPORT_CHOICES[number]) {
    setSelectedChoice(choice.id);
    setExportFilename((currentName) => {
      const fallbackName = buildDefaultExportFilename(
        sourceFileName,
        previewRevision,
        choice.format,
        choice.bitDepth,
      );

      return buildCustomExportName(
        currentName,
        fallbackName,
        choice.format,
        choice.bitDepth,
      );
    });
    setLastExportName(null);
    setExportErrorMessage(null);
  }

  const isExporting = Boolean(exportJob);
  const canExport =
    Boolean(previewBuffer) &&
    !hasPendingChanges &&
    !isRendering &&
    !isExporting;
  const buttonLabel = isExporting
    ? exportJob?.title ?? "Préparation export..."
    : "Exporter le fichier";

  return (
    <>
      {exportJob && (
        <div
          className="guided-processing-overlay export-processing-overlay"
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          aria-labelledby="export-dialog-title"
          aria-describedby="export-dialog-description"
        >
          <div className="guided-processing-card processing-modal-premium export-processing-card" tabIndex={-1} autoFocus>
            <p className="eyebrow">Export local</p>
            <h2 id="export-dialog-title">{exportJob.title}</h2>
            <p id="export-dialog-description">{exportJob.detail}</p>
            <div className="export-spinner" aria-hidden="true" />
            <strong>Aucun upload - traitement navigateur</strong>
          </div>
        </div>
      )}

      <section className="panel export-panel premium-export-panel">
        <div className="panel-heading compact-heading compact-export-heading">
          <div>
            <h2>
              {previewBuffer
                ? `Exporter le rendu sélectionné #${previewRevision}${previewRenderedAt ? ` - ${previewRenderedAt}` : ""}`
                : "Exporter le rendu"}
            </h2>
          </div>
          {previewBuffer && hasPendingChanges && onRegenerateRequest ? (
            <button
              type="button"
              className="status-pill status-pill-button"
              onClick={onRegenerateRequest}
              title="Régénérer le rendu avec les réglages actuels."
            >
              À régénérer
            </button>
          ) : (
            <span className={canExport ? "status-pill ready-pill" : "status-pill"}>
              {canExport ? "Prêt" : previewBuffer ? "À régénérer" : "Rendu requis"}
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
              disabled={!previewBuffer || isRendering || isExporting}
              onClick={() => handleExportChoiceChange(choice)}
            >
              <span className="export-radio" aria-hidden="true" />
              <span className="export-choice-copy">
                <strong>{choice.title}</strong>
                <small>{choice.help}</small>
              </span>
            </button>
          ))}
        </div>

        <label className="export-filename-field premium-export-filename">
          <span>Nom du fichier</span>
          <input
            type="text"
            value={exportFilename}
            disabled={!previewBuffer || isRendering || isExporting}
            onChange={(event) => setExportFilename(event.target.value)}
          />
        </label>

        <button
          type="button"
          className="primary-button export-main-button premium-download-button"
          disabled={!canExport}
          onClick={handleSelectedExport}
          aria-busy={isExporting}
        >
          {buttonLabel}
        </button>

        {!previewBuffer && (
          <p className="message message-info">
            Génère d’abord un rendu pour activer l’export.
          </p>
        )}

        {hasPendingChanges && previewBuffer && (
          <p className="message message-warning export-action-warning">
            Réglages modifiés. Régénère le rendu avant export.
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
    </>
  );
}

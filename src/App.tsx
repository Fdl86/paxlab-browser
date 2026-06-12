import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { analyzeSource } from "./audio/advancedAnalysis";
import { buildSettingsFromAnalysis } from "./audio/autoTarget";
import { formatBytes, formatDuration } from "./audio/audioBufferUtils";
import { decodeAudioFile } from "./audio/decodeAudio";
import { DEFAULT_PREVIEW_SETTINGS } from "./audio/previewPresets";
import { renderPreviewMaster } from "./audio/renderPreviewMaster";
import { useABAudioPlayer } from "./audio/useABAudioPlayer";
import type {
  AnalysisStatus,
  AutoIntensityId,
  DecodedAudioData,
  DecodeStatus,
  PreviewRenderResult,
  PreviewSettings,
  PreviewStatus,
  SourceAnalysisResult
} from "./audio/types";
import { ExportPanel } from "./components/ExportPanel";
import { MasterDashboard } from "./components/MasterDashboard";
import { MetricsPanel } from "./components/MetricsPanel";
import { PreviewControls } from "./components/PreviewControls";
import { PreviewHistoryPanel, type PreviewHistoryItem } from "./components/PreviewHistoryPanel";
import { ProcessingReportPanel } from "./components/ProcessingReportPanel";
import { RealtimeMonitorPanel } from "./components/RealtimeMonitorPanel";
import { SmartAdvisorPanel } from "./components/SmartAdvisorPanel";
import { UploadPanel } from "./components/UploadPanel";

const RENDER_STEPS = [
  "Chargement local",
  "Analyse du morceau",
  "Cible automatique",
  "Correction du spectre",
  "Optimisation dynamique",
  "Normalisation du niveau",
  "Sécurité peak",
  "Préparation export"
];

const SIMPLE_RENDERS: Array<{
  id: AutoIntensityId;
  label: string;
  title: string;
  text: string;
}> = [
  {
    id: "safe",
    label: "Propre",
    title: "Naturel et confortable",
    text: "Garde plus de marge et évite de trop pousser."
  },
  {
    id: "balanced",
    label: "Équilibré",
    title: "Le choix recommandé",
    text: "Plus net, plus stable, sans perdre la respiration."
  },
  {
    id: "impact",
    label: "Impact",
    title: "Plus fort et plus dense",
    text: "Basses plus présentes et rendu plus massif."
  },
  {
    id: "youtube",
    label: "Mix YouTube",
    title: "Upload propre à -14 LUFS max",
    text: "Niveau stabilisé, peak prudent, grave et aigus IA contrôlés."
  }
];

const AUDIO_ACCEPT = "audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.aiff,.aif";
const MAX_AUDIO_FILE_SIZE_BYTES = 300 * 1024 * 1024;

function isLikelySupportedAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("audio/") ||
    [".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"].some((extension) =>
      name.endsWith(extension)
    )
  );
}

function validateAudioFileCandidate(file: File): string | null {
  if (!isLikelySupportedAudioFile(file)) {
    return "Format non reconnu. Essaie un WAV ou MP3, ou un format audio compatible avec ton navigateur.";
  }

  if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
    return `Fichier trop lourd (${formatBytes(file.size)}). Pour protéger le navigateur, utilise un fichier de moins de ${formatBytes(MAX_AUDIO_FILE_SIZE_BYTES)}.`;
  }

  return null;
}

function isTypingInEditableField(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPreviewMonitorGainDb(previewResult: PreviewRenderResult | null, equalVolume: boolean): number {
  if (!equalVolume || !previewResult) {
    return 0;
  }

  const before = previewResult.beforeMetrics.estimatedLufs;
  const after = previewResult.afterMetrics.estimatedLufs;

  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return 0;
  }

  return clampNumber(before - after, -9, 3);
}

function getSettingsSignature(settings: PreviewSettings | null): string {
  if (!settings) {
    return "";
  }

  return JSON.stringify(
    Object.entries(settings).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
  );
}

function areSettingsEqual(left: PreviewSettings | null, right: PreviewSettings): boolean {
  return getSettingsSignature(left) === getSettingsSignature(right);
}

function intensityLabel(value: AutoIntensityId): string {
  if (value === "safe") {
    return "Propre";
  }

  if (value === "impact") {
    return "Impact";
  }

  if (value === "youtube") {
    return "Mix YouTube";
  }

  return "Équilibré";
}

function sourceAcceptsAudio(file: File): boolean {
  return validateAudioFileCandidate(file) === null;
}

function ProcessingOverlay({
  isVisible,
  activeStep,
  progress
}: {
  isVisible: boolean;
  activeStep: number;
  progress: number;
}) {
  if (!isVisible) {
    return null;
  }

  const safeProgress = Math.min(98, Math.max(6, progress));
  const activeIndex = Math.min(RENDER_STEPS.length - 1, Math.max(0, activeStep));

  return (
    <div className="guided-processing-overlay" role="status" aria-live="polite">
      <div className="guided-processing-card">
        <div className="processing-orb" aria-hidden="true" />
        <p className="eyebrow">Traitement local</p>
        <h2>Préparation de la Preview</h2>
        <p>Le rendu est généré dans ton navigateur. Aucun serveur, aucun upload.</p>
        <div className="guided-progress" style={{ "--progress": `${safeProgress}%` } as CSSProperties}>
          <span />
        </div>
        <strong>{Math.round(safeProgress)} % · {RENDER_STEPS[activeIndex]}</strong>
        <div className="guided-processing-steps">
          {RENDER_STEPS.map((step, index) => (
            <span key={step} className={index <= activeIndex ? "done" : ""}>{step}</span>
          ))}
        </div>
      </div>
    </div>
  );
}


function WorkflowStepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  const steps = [
    { id: 1, label: "Importer", help: "WAV ou MP3" },
    { id: 2, label: "Mixer", help: "Mix YouTube" },
    { id: 3, label: "Comparer", help: "A/B transparent" },
    { id: 4, label: "Exporter", help: "WAV / FLAC" }
  ];

  return (
    <section className="guided-stepper" aria-label="Workflow PAXLAB">
      {steps.map((item) => (
        <div key={item.id} className={step >= item.id ? "guided-step active" : "guided-step"}>
          <b>{item.id}</b>
          <span>{item.label}</span>
          <small>{item.help}</small>
        </div>
      ))}
    </section>
  );
}

function SourceLoadedCard({
  decodedAudio,
  onFileSelected
}: {
  decodedAudio: DecodedAudioData;
  onFileSelected: (file: File) => void;
}) {
  function handleChange(file: File | undefined) {
    if (!file || !sourceAcceptsAudio(file)) {
      return;
    }

    onFileSelected(file);
  }

  return (
    <section className="panel guided-source-card">
      <div>
        <p className="eyebrow">Morceau chargé</p>
        <h2>{decodedAudio.file.name}</h2>
        <p>{formatDuration(decodedAudio.info.durationSeconds)} · {decodedAudio.info.sampleRate.toLocaleString("fr-FR")} Hz · {decodedAudio.info.numberOfChannels} canal{decodedAudio.info.numberOfChannels > 1 ? "x" : ""}</p>
      </div>
      <label className="secondary-file-button icon-button-label">
        <span aria-hidden="true">↺</span>
        Changer de fichier
        <input
          type="file"
          accept={AUDIO_ACCEPT}
          onChange={(event) => handleChange(event.target.files?.[0])}
        />
      </label>
    </section>
  );
}

function RenderChoiceCard({
  settings,
  sourceAnalysis,
  hasAudio,
  hasPreview,
  hasPendingChanges,
  previewStatus,
  previewErrorMessage,
  onSettingsChange,
  onRenderPreview
}: {
  settings: PreviewSettings;
  sourceAnalysis: SourceAnalysisResult | null;
  hasAudio: boolean;
  hasPreview: boolean;
  hasPendingChanges: boolean;
  previewStatus: PreviewStatus;
  previewErrorMessage: string | null;
  onSettingsChange: (settings: PreviewSettings) => void;
  onRenderPreview: () => void;
}) {
  const isRendering = previewStatus === "rendering";

  function rebuild(partial: Partial<PreviewSettings>) {
    const base = {
      ...settings,
      ...partial
    };

    if (!sourceAnalysis) {
      onSettingsChange(base);
      return;
    }

    const rebuilt = buildSettingsFromAnalysis(sourceAnalysis.metrics, base.presetId, {
      autoIntensity: base.autoIntensity,
      antiFatigue: base.antiFatigue,
      spacePreserve: base.spacePreserve
    });

    const isNextYoutubeMix = base.autoIntensity === "youtube";
    const preservedTargetLufs = isNextYoutubeMix
      ? Math.min(settings.targetLufsEstimate, -14.4)
      : settings.targetLufsEstimate;
    const preservedTargetRms = preservedTargetLufs !== settings.targetLufsEstimate
      ? preservedTargetLufs + 0.75
      : settings.targetRmsDb;

    onSettingsChange({
      ...rebuilt,
      sourceRepair: settings.sourceRepair,
      highTreatment: settings.highTreatment,
      intensity: settings.intensity,
      targetRmsDb: preservedTargetRms,
      targetLufsEstimate: preservedTargetLufs,
      maxPeakDb: settings.maxPeakDb,
      stereoWidth: settings.stereoWidth,
      density: settings.density,
      presetId: base.presetId,
      autoIntensity: base.autoIntensity,
      antiFatigue: base.antiFatigue,
      spacePreserve: base.spacePreserve
    });
  }

  const buttonLabel = isRendering
    ? "Préparation en cours..."
    : hasPreview
      ? hasPendingChanges
        ? "Régénérer la Preview"
        : "Générer une autre Preview"
      : "Générer la Preview";

  return (
    <section className="panel guided-render-card">
      <div className="guided-card-heading">
        <div>
          <p className="eyebrow">Rendu</p>
          <h2>Choisis le rendu</h2>
        </div>
        <span className="status-pill">Mode simple</span>
      </div>

      <div className="guided-render-options" aria-label="Choix du rendu">
        {SIMPLE_RENDERS.map((render) => (
          <button
            key={render.id}
            type="button"
            className={settings.autoIntensity === render.id ? "guided-render-option active" : "guided-render-option"}
            disabled={!hasAudio || isRendering}
            onClick={() => rebuild({ autoIntensity: render.id, presetId: render.id === "youtube" ? "youtube" : "auto" })}
          >
            <strong>{render.label}</strong>
            <span>{render.title}</span>
            <small>{render.text}</small>
          </button>
        ))}
      </div>

      <label className={settings.antiFatigue ? "guided-fatigue active" : "guided-fatigue"}>
        <input
          type="checkbox"
          disabled={!hasAudio || isRendering}
          checked={settings.antiFatigue}
          onChange={(event) => rebuild({ antiFatigue: event.target.checked })}
        />
        <span>
          <strong>AI Brightness Smoothing</strong>
          <small>Calme les aigus métalliques, le fizz et la fatigue d’écoute.</small>
        </span>
      </label>

      <button
        type="button"
        className="primary-button guided-main-cta"
        disabled={!hasAudio || isRendering}
        onClick={onRenderPreview}
      >
        {buttonLabel}
        <small>Traitement local, version de comparaison à valider à l’écoute</small>
      </button>

      {hasPendingChanges && hasPreview && (
        <p className="message message-warning">Les réglages ont changé. Régénère pour mettre la Preview à jour.</p>
      )}
      {previewStatus === "error" && previewErrorMessage && (
        <p className="message message-error">{previewErrorMessage}</p>
      )}
    </section>
  );
}

function PreviewReadyCard({
  previewResult,
  settings,
  revision,
  renderedAt,
  hasPendingChanges
}: {
  previewResult: PreviewRenderResult;
  settings: PreviewSettings;
  revision: number;
  renderedAt: string | null;
  hasPendingChanges: boolean;
}) {
  const headroom = previewResult.report.loudness.headroomSummary?.finalHeadroomDb ?? previewResult.report.loudness.achievedHeadroomDb;
  const label = intensityLabel(settings.autoIntensity);

  return (
    <section className={hasPendingChanges ? "guided-ready-card pending" : "guided-ready-card"}>
      <div>
        <p className="eyebrow">Preview prête</p>
        <h2>{hasPendingChanges ? "Preview à régénérer" : "Version de comparaison prête"}</h2>
        <p>
          Preview #{revision}{renderedAt ? ` · ${renderedAt}` : ""} · {label}{settings.antiFatigue ? " · AI Brightness Smoothing" : ""}
        </p>
      </div>
      <div className="guided-ready-metrics">
        <span><b>{previewResult.afterMetrics.estimatedLufs.toFixed(1)}</b> LUFS est.</span>
        <span><b>{headroom.toFixed(1)}</b> dB marge</span>
        <span><b>{hasPendingChanges ? "À jour ?" : "OK"}</b> statut</span>
      </div>
    </section>
  );
}

function CompactStudioTopbar() {
  return (
    <header className="compact-studio-topbar compact-studio-topbar-minimal">
      <div className="compact-brand-block">
        <strong>PAXLAB Browser Engine</strong>
        <span>DEV15.16.4 - local, simple, sans upload</span>
      </div>
      <div className="compact-topbar-actions">
        <div className="compact-trust-badges" aria-label="Garanties PAXLAB">
          <span>Local</span>
          <span>Aucun upload</span>
          <span>Preview A/B</span>
        </div>
      </div>
    </header>
  );
}

function CompactPreviewSummary({
  previewResult,
  settings,
  revision,
  renderedAt,
  hasPendingChanges
}: {
  previewResult: PreviewRenderResult;
  settings: PreviewSettings;
  revision: number;
  renderedAt: string | null;
  hasPendingChanges: boolean;
}) {
  const headroom = previewResult.report.loudness.headroomSummary?.finalHeadroomDb ?? previewResult.report.loudness.achievedHeadroomDb;
  const label = intensityLabel(settings.autoIntensity);

  return (
    <section className={hasPendingChanges ? "compact-preview-status pending" : "compact-preview-status"}>
      <strong>{hasPendingChanges ? "Preview à régénérer" : `Preview #${revision} prête`}</strong>
      <span>{label}</span>
      <span>{settings.antiFatigue ? "AI Brightness Smoothing actif" : "AI Brightness Smoothing off"}</span>
      <span>{previewResult.afterMetrics.estimatedLufs.toFixed(1)} LUFS est.</span>
      <span>{headroom.toFixed(1)} dB marge</span>
      {renderedAt && <small>{renderedAt}</small>}
    </section>
  );
}

function ResultSideSummary({
  previewResult,
  settings,
  revision,
  renderedAt,
  hasPendingChanges,
  onToggleModify
}: {
  previewResult: PreviewRenderResult;
  settings: PreviewSettings;
  revision: number;
  renderedAt: string | null;
  hasPendingChanges: boolean;
  onToggleModify: () => void;
}) {
  const headroom = previewResult.report.loudness.headroomSummary?.finalHeadroomDb ?? previewResult.report.loudness.achievedHeadroomDb;
  return (
    <section className="panel compact-side-summary">
      <p className="eyebrow">Preview</p>
      <h2>{hasPendingChanges ? "À régénérer" : `#${revision} prête`}</h2>
      <div className="compact-summary-grid">
        <span><b>{intensityLabel(settings.autoIntensity)}</b><small>Rendu</small></span>
        <span><b>{previewResult.afterMetrics.estimatedLufs.toFixed(1)}</b><small>LUFS est.</small></span>
        <span><b>{headroom.toFixed(1)} dB</b><small>Marge peak</small></span>
      </div>
      <p>{renderedAt ? `Version générée à ${renderedAt}. ` : ""}{settings.antiFatigue ? "AI Brightness Smoothing actif." : "AI Brightness Smoothing off."}</p>
      <button type="button" className="secondary-action-button" onClick={onToggleModify}>Modifier le rendu</button>
    </section>
  );
}

function SimpleLanding({
  selectedFile,
  isDecoding,
  errorMessage,
  onFileSelected
}: {
  selectedFile: File | null;
  isDecoding: boolean;
  errorMessage: string | null;
  onFileSelected: (file: File) => void;
}) {
  return (
    <>
      <header className="guided-landing-hero">
        <p className="version">PAXLAB Browser Engine - DEV15.16.4 Player and export alignment hotfix</p>
        <h1>Améliore tes morceaux IA localement.</h1>
        <p>
          Importe un WAV ou MP3, choisis un rendu, génère une Preview plus propre et plus puissante, compare à l’écoute, puis exporte en WAV ou FLAC.
        </p>
        <div className="guided-trust-row">
          <span>Local navigateur</span>
          <span>Aucun upload</span>
          <span>A/B Original / Preview</span>
          <span>Export WAV / FLAC</span>
        </div>
      </header>

      <section className="guided-landing-grid">
        <UploadPanel selectedFile={selectedFile} isDecoding={isDecoding} onFileSelected={onFileSelected} />
        {errorMessage && <p className="message message-error landing-error-message">{errorMessage}</p>}
        <div className="panel guided-workflow-card">
          <p className="eyebrow">Workflow</p>
          <h2>Simple, rapide, contrôlé</h2>
          <ol>
            <li><b>Importer</b><span>Charge ton morceau IA.</span></li>
            <li><b>Mixer</b><span>Mix YouTube ou rendu simple.</span></li>
            <li><b>Comparer</b><span>Écoute Original / Preview en A/B.</span></li>
            <li><b>Exporter</b><span>Récupère ton WAV ou FLAC local.</span></li>
          </ol>
        </div>
      </section>
    </>
  );
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [decodeStatus, setDecodeStatus] = useState<DecodeStatus>("idle");
  const [decodedAudio, setDecodedAudio] = useState<DecodedAudioData | null>(null);
  const [decodeErrorMessage, setDecodeErrorMessage] = useState<string | null>(null);

  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [sourceAnalysis, setSourceAnalysis] = useState<SourceAnalysisResult | null>(null);
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<string | null>(null);

  const [previewSettings, setPreviewSettings] = useState<PreviewSettings>({ ...DEFAULT_PREVIEW_SETTINGS });
  const [appliedPreviewSettings, setAppliedPreviewSettings] = useState<PreviewSettings | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewResult, setPreviewResult] = useState<PreviewRenderResult | null>(null);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewCounter, setPreviewCounter] = useState(0);
  const [previewRenderedAt, setPreviewRenderedAt] = useState<string | null>(null);
  const [previewHistory, setPreviewHistory] = useState<PreviewHistoryItem[]>([]);
  const [shouldSelectPreviewAfterRender, setShouldSelectPreviewAfterRender] = useState(false);
  const [showRenderEditor, setShowRenderEditor] = useState(false);
  const [renderProgressStep, setRenderProgressStep] = useState(0);
  const [renderProgressValue, setRenderProgressValue] = useState(6);
  const [exportedRevision, setExportedRevision] = useState<number | null>(null);
  const exportPanelRef = useRef<HTMLDivElement | null>(null);
  const [monitorEqualVolume, setMonitorEqualVolume] = useState(false);
  const renderTokenRef = useRef(0);
  const renderInFlightRef = useRef(false);

  const previewMonitorGainDb = useMemo(
    () => getPreviewMonitorGainDb(previewResult, monitorEqualVolume),
    [monitorEqualVolume, previewResult]
  );

  const player = useABAudioPlayer({
    originalBuffer: decodedAudio?.audioBuffer ?? null,
    previewBuffer: previewResult?.buffer ?? null,
    monitorGainDbBySource: {
      original: 0,
      preview: previewMonitorGainDb
    }
  });

  const hasPendingChanges = useMemo(
    () => Boolean(previewResult) && !areSettingsEqual(appliedPreviewSettings, previewSettings),
    [appliedPreviewSettings, previewResult, previewSettings]
  );

  useEffect(() => {
    if (!selectedFile) {
      setDecodeStatus("idle");
      setDecodedAudio(null);
      setDecodeErrorMessage(null);
      setAnalysisStatus("idle");
      setSourceAnalysis(null);
      setAnalysisErrorMessage(null);
      setPreviewStatus("idle");
      setPreviewResult(null);
      setPreviewErrorMessage(null);
      setAppliedPreviewSettings(null);
      setPreviewRevision(0);
      setPreviewCounter(0);
      setPreviewRenderedAt(null);
      setPreviewHistory([]);
      setShouldSelectPreviewAfterRender(false);
      setShowRenderEditor(false);
      setExportedRevision(null);
      renderTokenRef.current += 1;
      return;
    }

    let isCurrentFile = true;

    async function runDecode() {
      setDecodeStatus("loading");
      setDecodedAudio(null);
      setDecodeErrorMessage(null);
      setAnalysisStatus("idle");
      setSourceAnalysis(null);
      setAnalysisErrorMessage(null);
      setPreviewStatus("idle");
      setPreviewResult(null);
      setPreviewErrorMessage(null);
      setAppliedPreviewSettings(null);
      setPreviewRevision(0);
      setPreviewCounter(0);
      setPreviewRenderedAt(null);
      setPreviewHistory([]);
      setShouldSelectPreviewAfterRender(false);
      setShowRenderEditor(false);
      setExportedRevision(null);

      try {
        const validationMessage = validateAudioFileCandidate(selectedFile as File);
        if (validationMessage) {
          throw new Error(validationMessage);
        }

        const decoded = await decodeAudioFile(selectedFile as File);

        if (!isCurrentFile) {
          return;
        }

        setDecodedAudio(decoded);
        setDecodeStatus("success");
      } catch (error) {
        if (!isCurrentFile) {
          return;
        }

        const message = error instanceof Error ? error.message : "Erreur inconnue pendant le décodage audio.";
        setDecodeErrorMessage(message);
        setDecodeStatus("error");
      }
    }

    void runDecode();

    return () => {
      isCurrentFile = false;
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!decodedAudio?.audioBuffer) {
      return;
    }

    let isCurrentAudio = true;
    const buffer = decodedAudio.audioBuffer;

    async function runAnalysis() {
      setAnalysisStatus("running");
      setSourceAnalysis(null);
      setAnalysisErrorMessage(null);

      await new Promise((resolve) => window.setTimeout(resolve, 20));

      try {
        const result = analyzeSource(buffer);

        if (!isCurrentAudio) {
          return;
        }

        setSourceAnalysis(result);
        setPreviewSettings(buildSettingsFromAnalysis(result.metrics));
        setAnalysisStatus("ready");
      } catch (error) {
        if (!isCurrentAudio) {
          return;
        }

        const message = error instanceof Error ? error.message : "Erreur inconnue pendant l’analyse locale.";
        setAnalysisErrorMessage(message);
        setAnalysisStatus("error");
      }
    }

    void runAnalysis();

    return () => {
      isCurrentAudio = false;
    };
  }, [decodedAudio]);

  async function handleRenderPreview(settingsOverride?: PreviewSettings) {
    if (!decodedAudio?.audioBuffer || renderInFlightRef.current || previewStatus === "rendering") {
      return;
    }

    renderInFlightRef.current = true;
    const settingsToRender = settingsOverride ? { ...settingsOverride } : { ...previewSettings };
    const renderToken = renderTokenRef.current + 1;
    renderTokenRef.current = renderToken;

    player.stop();

    const nextRevision = previewCounter + 1;

    setPreviewSettings(settingsToRender);
    setPreviewStatus("rendering");
    setPreviewErrorMessage(null);
    setPreviewResult(null);
    setAppliedPreviewSettings(null);
    setPreviewRenderedAt(null);
    setShouldSelectPreviewAfterRender(true);
    setRenderProgressStep(0);
    setRenderProgressValue(8);
    setExportedRevision(null);

    try {
      const result = await renderPreviewMaster(decodedAudio.audioBuffer, settingsToRender, (event) => {
        if (renderToken !== renderTokenRef.current) {
          return;
        }
        setRenderProgressStep(event.stepIndex);
        setRenderProgressValue(event.progress);
      });
      if (renderToken !== renderTokenRef.current) {
        return;
      }

      const renderedAt = new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      const historyItem: PreviewHistoryItem = {
        id: nextRevision,
        renderedAt,
        result,
        settings: { ...settingsToRender }
      };

      setPreviewResult(result);
      setAppliedPreviewSettings({ ...settingsToRender });
      setPreviewRevision(nextRevision);
      setPreviewCounter(nextRevision);
      setPreviewRenderedAt(renderedAt);
      setPreviewHistory((items) => [historyItem, ...items].slice(0, 6));
      setRenderProgressStep(RENDER_STEPS.length - 1);
      setRenderProgressValue(100);
      setPreviewStatus("ready");
      setShowRenderEditor(false);
    } catch (error) {
      if (renderToken !== renderTokenRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : "Erreur inconnue pendant la génération de la Preview Master.";
      setPreviewErrorMessage(message);
      setPreviewStatus("error");
      setShouldSelectPreviewAfterRender(false);
    } finally {
      renderInFlightRef.current = false;
    }
  }

  function handleSelectHistory(item: PreviewHistoryItem) {
    player.stop();
    setPreviewResult(item.result);
    setPreviewSettings({ ...item.settings });
    setAppliedPreviewSettings({ ...item.settings });
    setPreviewRevision(item.id);
    setPreviewRenderedAt(item.renderedAt);
    setPreviewStatus("ready");
    setPreviewErrorMessage(null);
    setShouldSelectPreviewAfterRender(true);
    setExportedRevision(null);
  }

  function handleApplyRecommended(settings: PreviewSettings) {
    player.stop();
    setPreviewSettings({ ...settings });
  }

  useEffect(() => {
    if (previewStatus !== "ready" || !previewResult || !shouldSelectPreviewAfterRender) {
      return;
    }

    void player.switchSource("preview");
    setShouldSelectPreviewAfterRender(false);
  }, [player, previewResult, previewStatus, shouldSelectPreviewAfterRender]);

  function handleSelectFile(file: File) {
    const validationMessage = validateAudioFileCandidate(file);
    player.stop();
    renderTokenRef.current += 1;

    if (validationMessage) {
      setSelectedFile(file);
      setDecodedAudio(null);
      setDecodeStatus("error");
      setDecodeErrorMessage(validationMessage);
      setPreviewStatus("idle");
      setPreviewResult(null);
      return;
    }

    setSelectedFile(file);
  }

  function handleScrollToExport() {
    exportPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      if (isTypingInEditableField(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === " ") {
        if (decodedAudio || previewResult) {
          event.preventDefault();
          void player.playPause();
        }
        return;
      }

      if (key === "s") {
        event.preventDefault();
        player.stop();
        return;
      }

      if (key === "a" && previewResult) {
        event.preventDefault();
        void player.switchSource(player.activeSource === "preview" ? "original" : "preview");
        return;
      }

      if (key === "r" && decodedAudio && previewStatus !== "rendering") {
        event.preventDefault();
        void handleRenderPreview();
        return;
      }

      if (key === "e" && previewResult) {
        event.preventDefault();
        handleScrollToExport();
      }
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [decodedAudio, player, previewResult, previewStatus]);

  const workflowStep: 1 | 2 | 3 | 4 = !decodedAudio
    ? 1
    : !hasPendingChanges && exportedRevision && previewRevision > 0 && exportedRevision === previewRevision
      ? 4
      : previewResult
        ? 3
        : 2;
  const readySettings = previewResult?.settings ?? previewSettings;

  return (
    <main className="guided-shell">
      <ProcessingOverlay
        isVisible={previewStatus === "rendering"}
        activeStep={renderProgressStep}
        progress={renderProgressValue}
      />

      {!decodedAudio && (
        <SimpleLanding selectedFile={selectedFile} isDecoding={decodeStatus === "loading"} errorMessage={decodeErrorMessage} onFileSelected={handleSelectFile} />
      )}

      {decodedAudio && (
        <>
          <CompactStudioTopbar />

          <WorkflowStepper step={workflowStep} />

          {decodeStatus === "error" && decodeErrorMessage && <p className="message message-error standalone-message">{decodeErrorMessage}</p>}
          {analysisStatus === "running" && <p className="message message-info standalone-message">Analyse locale en cours : niveau, spectre et cible automatique.</p>}
          {analysisStatus === "error" && analysisErrorMessage && <p className="message message-error standalone-message">{analysisErrorMessage}</p>}

          {!previewResult && (
            <section className="guided-config-grid">
              <SourceLoadedCard decodedAudio={decodedAudio} onFileSelected={handleSelectFile} />
              <RenderChoiceCard
                settings={previewSettings}
                sourceAnalysis={sourceAnalysis}
                hasAudio={Boolean(decodedAudio)}
                hasPreview={Boolean(previewResult)}
                hasPendingChanges={hasPendingChanges}
                previewStatus={previewStatus}
                previewErrorMessage={previewErrorMessage}
                onSettingsChange={setPreviewSettings}
                onRenderPreview={() => void handleRenderPreview()}
              />
            </section>
          )}

          {previewResult && (
            <>
              <CompactPreviewSummary
                previewResult={previewResult}
                settings={readySettings}
                revision={previewRevision}
                renderedAt={previewRenderedAt}
                hasPendingChanges={hasPendingChanges}
              />

              <section className="guided-result-grid">
                <div className="guided-ab-stage">
                  <RealtimeMonitorPanel
                    fileName={selectedFile?.name ?? null}
                    originalBuffer={decodedAudio.audioBuffer}
                    previewBuffer={previewResult.buffer}
                    activeSource={player.activeSource}
                    currentTime={player.currentTime}
                    duration={player.duration}
                    isPlaying={player.isPlaying}
                    isSwitching={player.isSwitching}
                    canUsePreview={player.canPlayPreview}
                    previewStatus={previewStatus}
                    previewRevision={previewRevision}
                    previewRenderedAt={previewRenderedAt}
                    hasPendingChanges={hasPendingChanges}
                    meter={player.meter}
                    onPlayPause={() => void player.playPause()}
                    onStop={player.stop}
                    onSeek={player.seek}
                    onSwitchSource={(source) => void player.switchSource(source)}
                    onFileSelected={handleSelectFile}
                    onOpenExport={handleScrollToExport}
                    canOpenExport={Boolean(previewResult)}
                    equalVolume={monitorEqualVolume}
                    onToggleEqualVolume={() => setMonitorEqualVolume((value) => !value)}
                  />
                </div>

                <aside className="guided-result-side compact-side-panel">
                  <div ref={exportPanelRef} className="export-panel-anchor">
                    <ExportPanel
                      sourceFileName={selectedFile?.name ?? null}
                      previewBuffer={previewResult.buffer}
                      previewRevision={previewRevision}
                      previewRenderedAt={previewRenderedAt}
                      hasPendingChanges={hasPendingChanges}
                      isRendering={previewStatus === "rendering"}
                      onBeforeExport={player.stop}
                      onExported={() => setExportedRevision(previewRevision)}
                    />
                  </div>
                  <ResultSideSummary
                    previewResult={previewResult}
                    settings={readySettings}
                    revision={previewRevision}
                    renderedAt={previewRenderedAt}
                    hasPendingChanges={hasPendingChanges}
                    onToggleModify={() => setShowRenderEditor((value) => !value)}
                  />
                  {showRenderEditor && (
                    <RenderChoiceCard
                      settings={previewSettings}
                      sourceAnalysis={sourceAnalysis}
                      hasAudio={Boolean(decodedAudio)}
                      hasPreview={Boolean(previewResult)}
                      hasPendingChanges={hasPendingChanges}
                      previewStatus={previewStatus}
                      previewErrorMessage={previewErrorMessage}
                      onSettingsChange={setPreviewSettings}
                      onRenderPreview={() => void handleRenderPreview()}
                    />
                  )}

                </aside>
              </section>
            </>
          )}

          <section className="guided-accordions">
            {previewHistory.length > 0 && (
              <details className="guided-accordion">
                <summary>
                  <span>Historique des previews</span>
                  <small>{previewHistory.length} version{previewHistory.length > 1 ? "s" : ""} comparable{previewHistory.length > 1 ? "s" : ""}</small>
                </summary>
                <PreviewHistoryPanel
                  items={previewHistory}
                  activeRevision={previewRevision}
                  isRendering={previewStatus === "rendering"}
                  onSelect={handleSelectHistory}
                />
              </details>
            )}

            <details className="guided-accordion">
              <summary>
                <span>Réglages experts</span>
                <small>Préserver l’espace, intensité, plafond peak et nettoyage source</small>
              </summary>
              <PreviewControls
                settings={previewSettings}
                previewStatus={previewStatus}
                hasAudio={Boolean(decodedAudio)}
                hasPreview={Boolean(previewResult)}
                hasPendingChanges={hasPendingChanges}
                previewRevision={previewRevision}
                previewRenderedAt={previewRenderedAt}
                sourceAnalysis={sourceAnalysis}
                previewResult={previewResult}
                errorMessage={previewErrorMessage}
                onSettingsChange={setPreviewSettings}
                onRenderPreview={() => void handleRenderPreview()}
              />
            </details>

            <details className="guided-accordion">
              <summary>
                <span>Détails techniques</span>
                <small>Conseil automatique, rapport de traitement et mesures</small>
              </summary>
              <div className="guided-details-grid">
                <SmartAdvisorPanel
                  sourceAnalysis={sourceAnalysis}
                  previewResult={previewResult}
                  settings={previewSettings}
                  isRendering={previewStatus === "rendering"}
                  onApplySettings={handleApplyRecommended}
                />
                <MasterDashboard sourceAnalysis={sourceAnalysis} previewResult={previewResult} previewSettings={previewSettings} />
                <ProcessingReportPanel result={previewResult} />
                <MetricsPanel result={previewResult} sourceAnalysis={sourceAnalysis} />
              </div>
            </details>
          </section>
        </>
      )}

      <p className="ux-footer-note guided-footer-note">Mesures indicatives navigateur. Preview locale de comparaison, à valider à l’écoute.</p>
    </main>
  );
}

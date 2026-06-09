import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  "Préparation WAV"
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
  }
];

function areSettingsEqual(left: PreviewSettings | null, right: PreviewSettings): boolean {
  if (!left) {
    return false;
  }

  return (
    left.presetId === right.presetId &&
    left.highTreatment === right.highTreatment &&
    left.intensity === right.intensity &&
    left.targetRmsDb === right.targetRmsDb &&
    left.targetLufsEstimate === right.targetLufsEstimate &&
    left.maxPeakDb === right.maxPeakDb &&
    left.stereoWidth === right.stereoWidth &&
    left.density === right.density &&
    left.sourceRepair === right.sourceRepair &&
    left.autoIntensity === right.autoIntensity &&
    left.antiFatigue === right.antiFatigue &&
    left.spacePreserve === right.spacePreserve
  );
}

function intensityLabel(value: AutoIntensityId): string {
  if (value === "safe") {
    return "Propre";
  }

  if (value === "impact") {
    return "Impact";
  }

  return "Équilibré";
}

function sourceAcceptsAudio(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".wav") || name.endsWith(".mp3") || file.type.startsWith("audio/");
}

function ProcessingOverlay({ isVisible }: { isVisible: boolean }) {
  const [progress, setProgress] = useState(7);

  useEffect(() => {
    if (!isVisible) {
      setProgress(7);
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 96) {
          return value;
        }

        return Math.min(96, value + 8 + Math.random() * 9);
      });
    }, 180);

    return () => window.clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const activeIndex = Math.min(RENDER_STEPS.length - 1, Math.floor((progress / 100) * RENDER_STEPS.length));

  return (
    <div className="guided-processing-overlay" role="status" aria-live="polite">
      <div className="guided-processing-card">
        <div className="processing-orb" aria-hidden="true" />
        <p className="eyebrow">Traitement local</p>
        <h2>Préparation de la Preview</h2>
        <p>Le rendu est généré dans ton navigateur. Aucun serveur, aucun upload.</p>
        <div className="guided-progress" style={{ "--progress": `${progress}%` } as CSSProperties}>
          <span />
        </div>
        <strong>{Math.round(progress)} % · {RENDER_STEPS[activeIndex]}</strong>
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
    { id: 2, label: "Générer", help: "Choix simple" },
    { id: 3, label: "Comparer", help: "A/B" },
    { id: 4, label: "Exporter", help: "WAV local" }
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
      <label className="secondary-file-button">
        Changer de fichier
        <input
          type="file"
          accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3,.wav,.mp3"
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

    onSettingsChange({
      ...rebuilt,
      ...partial,
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
            onClick={() => rebuild({ autoIntensity: render.id })}
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
          <strong>Aigus fatigants</strong>
          <small>Calme les brillances agressives et les cymbales IA qui piquent.</small>
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
          Preview #{revision}{renderedAt ? ` · ${renderedAt}` : ""} · {label}{settings.antiFatigue ? " · Aigus fatigants" : ""}
        </p>
      </div>
      <div className="guided-ready-metrics">
        <span><b>{previewResult.afterMetrics.estimatedLufs.toFixed(1)}</b> LUFS est.</span>
        <span><b>{headroom.toFixed(1)}</b> dB HR</span>
        <span><b>{hasPendingChanges ? "À jour ?" : "OK"}</b> statut</span>
      </div>
    </section>
  );
}

function CompactStudioTopbar({
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
    <header className="compact-studio-topbar">
      <div className="compact-brand-block">
        <strong>PAXLAB Browser Engine</strong>
        <span>{decodedAudio.file.name}</span>
      </div>
      <div className="compact-topbar-actions">
        <label className="compact-change-file-button">
          Changer de morceau
          <input
            type="file"
            accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3,.wav,.mp3"
            onChange={(event) => handleChange(event.target.files?.[0])}
          />
        </label>
        <div className="compact-trust-badges" aria-label="Garanties PAXLAB">
          <span>Local</span>
          <span>Aucun upload</span>
          <span>Preview à valider</span>
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
      <span>{settings.antiFatigue ? "Aigus fatigants activé" : "Aigus fatigants off"}</span>
      <span>{previewResult.afterMetrics.estimatedLufs.toFixed(1)} LUFS est.</span>
      <span>{headroom.toFixed(1)} dB HR</span>
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
        <span><b>{headroom.toFixed(1)} dB</b><small>Headroom</small></span>
      </div>
      <p>{renderedAt ? `Version générée à ${renderedAt}. ` : ""}{settings.antiFatigue ? "Aigus fatigants activé." : "Aigus fatigants désactivé."}</p>
      <button type="button" className="secondary-action-button" onClick={onToggleModify}>Modifier le rendu</button>
    </section>
  );
}

function SimpleLanding({ onFileSelected }: { onFileSelected: (file: File) => void }) {
  return (
    <>
      <header className="guided-landing-hero">
        <p className="version">PAXLAB Browser Engine - dev12.3 Change File</p>
        <h1>Améliore tes morceaux IA localement.</h1>
        <p>
          Importe un WAV ou MP3, choisis un rendu, génère une Preview plus propre et plus puissante, compare à l’écoute, puis exporte.
        </p>
        <div className="guided-trust-row">
          <span>Local navigateur</span>
          <span>Aucun upload</span>
          <span>A/B Original / Preview</span>
          <span>Export WAV</span>
        </div>
      </header>

      <section className="guided-landing-grid">
        <UploadPanel selectedFile={null} isDecoding={false} onFileSelected={onFileSelected} />
        <div className="panel guided-workflow-card">
          <p className="eyebrow">Workflow</p>
          <h2>Simple, rapide, contrôlé</h2>
          <ol>
            <li><b>Importer</b><span>Charge ton morceau IA.</span></li>
            <li><b>Choisir</b><span>Propre, Équilibré ou Impact.</span></li>
            <li><b>Comparer</b><span>Écoute Original / Preview en A/B.</span></li>
            <li><b>Exporter</b><span>Récupère ton WAV local.</span></li>
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

  const player = useABAudioPlayer({
    originalBuffer: decodedAudio?.audioBuffer ?? null,
    previewBuffer: previewResult?.buffer ?? null
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

      try {
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
    if (!decodedAudio?.audioBuffer || previewStatus === "rendering") {
      return;
    }

    const settingsToRender = settingsOverride ? { ...settingsOverride } : { ...previewSettings };

    player.stop();

    const nextRevision = previewCounter + 1;

    setPreviewSettings(settingsToRender);
    setPreviewStatus("rendering");
    setPreviewErrorMessage(null);
    setPreviewResult(null);
    setAppliedPreviewSettings(null);
    setPreviewRenderedAt(null);
    setShouldSelectPreviewAfterRender(true);

    try {
      const result = await renderPreviewMaster(decodedAudio.audioBuffer, settingsToRender);
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
      setPreviewStatus("ready");
      setShowRenderEditor(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue pendant la génération de la Preview Master.";
      setPreviewErrorMessage(message);
      setPreviewStatus("error");
      setShouldSelectPreviewAfterRender(false);
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
  }

  function handleApplyRecommended(settings: PreviewSettings) {
    player.stop();
    setPreviewSettings({ ...settings });
  }

  function handleApplyRecommendedAndRender(settings: PreviewSettings) {
    void handleRenderPreview(settings);
  }

  useEffect(() => {
    if (previewStatus !== "ready" || !previewResult || !shouldSelectPreviewAfterRender) {
      return;
    }

    void player.switchSource("preview");
    setShouldSelectPreviewAfterRender(false);
  }, [player, previewResult, previewStatus, shouldSelectPreviewAfterRender]);

  function handleSelectFile(file: File) {
    player.stop();
    setSelectedFile(file);
  }

  const workflowStep: 1 | 2 | 3 | 4 = !decodedAudio ? 1 : previewResult ? 4 : previewStatus === "rendering" ? 2 : 2;
  const readySettings = previewResult?.settings ?? previewSettings;

  return (
    <main className="guided-shell">
      <ProcessingOverlay isVisible={previewStatus === "rendering"} />

      {!decodedAudio && (
        <SimpleLanding onFileSelected={handleSelectFile} />
      )}

      {decodedAudio && (
        <>
          <CompactStudioTopbar decodedAudio={decodedAudio} onFileSelected={handleSelectFile} />

          {!previewResult && <WorkflowStepper step={workflowStep} />}

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
                  />
                </div>

                <aside className="guided-result-side compact-side-panel">
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
                  <ExportPanel
                    sourceFileName={selectedFile?.name ?? null}
                    previewBuffer={previewResult.buffer}
                    previewRevision={previewRevision}
                    previewRenderedAt={previewRenderedAt}
                    hasPendingChanges={hasPendingChanges}
                    isRendering={previewStatus === "rendering"}
                    onBeforeExport={player.stop}
                  />
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
                <small>Préserver l’espace, intensité, headroom et nettoyage source</small>
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
                  onApplyAndRender={handleApplyRecommendedAndRender}
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

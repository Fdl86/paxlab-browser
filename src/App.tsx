import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { analyzeSource } from "./audio/advancedAnalysis";
import { buildSettingsFromAnalysis } from "./audio/autoTarget";
import { decodeAudioFile } from "./audio/decodeAudio";
import { renderPreviewMaster } from "./audio/renderPreviewMaster";
import { useABAudioPlayer } from "./audio/useABAudioPlayer";
import { DEFAULT_PREVIEW_SETTINGS } from "./audio/previewPresets";
import type {
  AnalysisStatus,
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
import { SessionStatusPanel } from "./components/SessionStatusPanel";
import { SmartAdvisorPanel } from "./components/SmartAdvisorPanel";
import { UploadPanel } from "./components/UploadPanel";

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

function formatRevisionLabel(revision: number, renderedAt: string | null): string {
  if (revision <= 0) {
    return "Aucune Preview";
  }

  return `Preview Master #${revision}${renderedAt ? ` · ${renderedAt}` : ""}`;
}

const RENDER_STEPS = [
  "Chargement local du fichier",
  "Analyse du morceau",
  "Cible automatique",
  "Correction du spectre",
  "Optimisation de la dynamique",
  "Normalisation du niveau",
  "Sécurité peak",
  "Préparation du WAV"
];

function ProcessingOverlay({ isVisible }: { isVisible: boolean }) {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    if (!isVisible) {
      setProgress(8);
      return;
    }

    const interval = window.setInterval(() => {
      setProgress((value) => {
        if (value >= 94) {
          return value;
        }

        return Math.min(94, value + 7 + Math.random() * 7);
      });
    }, 230);

    return () => window.clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const activeIndex = Math.min(RENDER_STEPS.length - 1, Math.floor((progress / 100) * RENDER_STEPS.length));

  return (
    <div className="studio-processing-overlay" role="status" aria-live="polite">
      <div className="studio-processing-card">
        <div className="processing-orb" aria-hidden="true" />
        <p className="eyebrow">Traitement local</p>
        <h2>Préparation de la Preview</h2>
        <p>Le moteur ajuste le rendu dans ton navigateur. Aucun upload, aucune API externe.</p>
        <div className="processing-progress" style={{ "--progress": `${progress}%` } as CSSProperties}>
          <span />
        </div>
        <strong>{Math.round(progress)} % · {RENDER_STEPS[activeIndex]}</strong>
        <div className="processing-steps">
          {RENDER_STEPS.map((step, index) => (
            <span key={step} className={index <= activeIndex ? "done" : ""}>{step}</span>
          ))}
        </div>
      </div>
    </div>
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

  const [previewSettings, setPreviewSettings] = useState<PreviewSettings>({
    ...DEFAULT_PREVIEW_SETTINGS
  });
  const [appliedPreviewSettings, setAppliedPreviewSettings] = useState<PreviewSettings | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewResult, setPreviewResult] = useState<PreviewRenderResult | null>(null);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewCounter, setPreviewCounter] = useState(0);
  const [previewRenderedAt, setPreviewRenderedAt] = useState<string | null>(null);
  const [previewHistory, setPreviewHistory] = useState<PreviewHistoryItem[]>([]);
  const [shouldSelectPreviewAfterRender, setShouldSelectPreviewAfterRender] = useState(false);

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

  const workflowStep = !decodedAudio ? 1 : previewResult ? 3 : previewStatus === "rendering" ? 2 : 2;
  const mainCtaLabel = !decodedAudio
    ? "Importer un morceau"
    : previewStatus === "rendering"
      ? "Génération en cours"
      : previewResult
        ? "Comparer et exporter"
        : "Générer la Preview";
  const stageLabel = !decodedAudio ? "Import" : previewStatus === "rendering" ? "Rendu" : previewResult ? "Résultat" : "Réglages";
  const readySummary = previewResult && !hasPendingChanges
    ? `${previewResult.afterMetrics.estimatedLufs.toFixed(1)} LUFS est. · HR ${(previewResult.report.loudness.headroomSummary?.finalHeadroomDb ?? previewResult.report.loudness.achievedHeadroomDb).toFixed(1)} dB`
    : null;

  return (
    <main className="app-shell ux-shell studio-pro-shell">
      <ProcessingOverlay isVisible={previewStatus === "rendering"} />
      <header className="ux-hero-wow studio-hero-pro">
        <div className="ux-hero-copy">
          <p className="version">PAXLAB Browser Engine - dev11 Studio UX Pro</p>
          <h1>Preview Master locale, simple et puissante.</h1>
          <p className="hero-text">
            Importe un morceau IA, choisis un rendu, génère une Preview, compare en A/B et exporte en WAV. Le son validé reste local dans ton navigateur.
          </p>
          <div className="ux-trust-row studio-trust-row">
            <span>100 % local</span>
            <span>A/B instantané</span>
            <span>Impact + anti-fatigue</span>
            <span>Export WAV</span>
          </div>
        </div>

        <div className="ux-now-card studio-command-card">
          <span>{stageLabel}</span>
          <strong>{mainCtaLabel}</strong>
          {readySummary && <em>{readySummary}</em>}
          <p>
            {hasPendingChanges
              ? "Réglages modifiés : clique sur régénérer pour mettre la Preview à jour."
              : previewRevision > 0
                ? formatRevisionLabel(previewRevision, previewRenderedAt)
                : "Commence par déposer un WAV ou MP3."}
          </p>
        </div>
      </header>

      <section className="ux-stepper studio-stepper" aria-label="Workflow PAXLAB">
        <div className={workflowStep >= 1 ? "ux-step active" : "ux-step"}>
          <b>1</b>
          <span>Importer</span>
          <small>WAV ou MP3</small>
        </div>
        <div className={workflowStep >= 2 ? "ux-step active" : "ux-step"}>
          <b>2</b>
          <span>Générer</span>
          <small>Propre / Équilibré / Impact</small>
        </div>
        <div className={workflowStep >= 3 ? "ux-step active" : "ux-step"}>
          <b>3</b>
          <span>Comparer</span>
          <small>A/B instantané</small>
        </div>
        <div className={previewResult && !hasPendingChanges ? "ux-step active" : "ux-step"}>
          <b>4</b>
          <span>Exporter</span>
          <small>WAV local</small>
        </div>
      </section>

      <section className="ux-top-grid studio-start-grid">
        <UploadPanel selectedFile={selectedFile} isDecoding={decodeStatus === "loading"} onFileSelected={setSelectedFile} />
        <SessionStatusPanel
          decodedAudio={decodedAudio}
          sourceAnalysis={sourceAnalysis}
          previewResult={previewResult}
          previewSettings={previewSettings}
          previewStatus={previewStatus}
          previewRevision={previewRevision}
          previewRenderedAt={previewRenderedAt}
          hasPendingChanges={hasPendingChanges}
        />
      </section>

      {decodeStatus === "error" && decodeErrorMessage && <p className="message message-error standalone-message">{decodeErrorMessage}</p>}
      {analysisStatus === "running" && <p className="message message-info standalone-message">Analyse locale en cours : niveau, spectre, stéréo et cible automatique.</p>}
      {analysisStatus === "error" && analysisErrorMessage && <p className="message message-error standalone-message">{analysisErrorMessage}</p>}

      <section className="ux-workbench studio-workbench-pro">
        <div className="ux-listening-zone studio-listening-stage">
          <RealtimeMonitorPanel
            fileName={selectedFile?.name ?? null}
            originalBuffer={decodedAudio?.audioBuffer ?? null}
            previewBuffer={previewResult?.buffer ?? null}
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

        <aside className="ux-action-zone studio-action-rail">
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

          <ExportPanel
            sourceFileName={selectedFile?.name ?? null}
            previewBuffer={previewResult?.buffer ?? null}
            previewRevision={previewRevision}
            previewRenderedAt={previewRenderedAt}
            hasPendingChanges={hasPendingChanges}
            isRendering={previewStatus === "rendering"}
            onBeforeExport={player.stop}
          />
        </aside>
      </section>

      {previewHistory.length > 0 && (
        <section className="ux-history-row">
          <PreviewHistoryPanel
            items={previewHistory}
            activeRevision={previewRevision}
            isRendering={previewStatus === "rendering"}
            onSelect={handleSelectHistory}
          />
        </section>
      )}

      <details className="ux-details-drawer studio-expert-drawer">
        <summary>
          <span>Analyse avancée</span>
          <small>Mesures, conseil automatique, rapport de traitement et détails avancés</small>
        </summary>
        <div className="ux-details-grid">
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

      <p className="ux-footer-note">
        Mesures indicatives navigateur. Preview locale de comparaison, à valider à l’écoute.
      </p>
    </main>
  );
}

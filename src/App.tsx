import { useEffect, useMemo, useState } from "react";
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
    left.sourceRepair === right.sourceRepair
  );
}

function formatRevisionLabel(revision: number, renderedAt: string | null): string {
  if (revision <= 0) {
    return "Aucune Preview";
  }

  return `Preview Master #${revision}${renderedAt ? ` · ${renderedAt}` : ""}`;
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

  return (
    <main className="app-shell control-room-shell">
      <header className="hero studio-hero">
        <div>
          <p className="version">PAXLAB Browser Engine - dev06 Control Room</p>
          <h1>PAXLAB Control Room</h1>
          <p className="hero-text">
            Interface recentrée sur l’écoute : import local, Smart Repair, Preview Master traçable, A/B temps réel et export WAV validé à l’oreille.
          </p>
        </div>

        <div className="privacy-card studio-status-card">
          <span>Session active</span>
          <strong>{formatRevisionLabel(previewRevision, previewRenderedAt)}</strong>
          <p>
            {hasPendingChanges
              ? "Réglages modifiés : régénère pour travailler sur la bonne version."
              : "Traitement local, non destructif, aucune API externe."}
          </p>
        </div>
      </header>

      <div className="studio-command-bar">
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
      </div>

      {decodeStatus === "error" && decodeErrorMessage && <p className="message message-error standalone-message">{decodeErrorMessage}</p>}
      {analysisStatus === "running" && <p className="message message-info standalone-message">Analyse locale en cours : niveau, spectre, stéréo et cible automatique.</p>}
      {analysisStatus === "error" && analysisErrorMessage && <p className="message message-error standalone-message">{analysisErrorMessage}</p>}

      <section className="studio-main-grid">
        <div className="studio-monitor-column">
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

          <MasterDashboard sourceAnalysis={sourceAnalysis} previewResult={previewResult} />
        </div>

        <div className="studio-side-column">
          <SmartAdvisorPanel
            sourceAnalysis={sourceAnalysis}
            previewResult={previewResult}
            settings={previewSettings}
            isRendering={previewStatus === "rendering"}
            onApplySettings={handleApplyRecommended}
            onApplyAndRender={handleApplyRecommendedAndRender}
          />

          <PreviewControls
            settings={previewSettings}
            previewStatus={previewStatus}
            hasAudio={Boolean(decodedAudio)}
            hasPreview={Boolean(previewResult)}
            hasPendingChanges={hasPendingChanges}
            previewRevision={previewRevision}
            previewRenderedAt={previewRenderedAt}
            errorMessage={previewErrorMessage}
            onSettingsChange={setPreviewSettings}
            onRenderPreview={() => void handleRenderPreview()}
          />
        </div>
      </section>

      <section className="studio-lower-grid">
        <PreviewHistoryPanel
          items={previewHistory}
          activeRevision={previewRevision}
          isRendering={previewStatus === "rendering"}
          onSelect={handleSelectHistory}
        />

        <ProcessingReportPanel result={previewResult} />

        <ExportPanel
          sourceFileName={selectedFile?.name ?? null}
          previewBuffer={previewResult?.buffer ?? null}
          previewRevision={previewRevision}
          previewRenderedAt={previewRenderedAt}
          hasPendingChanges={hasPendingChanges}
          isRendering={previewStatus === "rendering"}
          onBeforeExport={player.stop}
        />
      </section>

      <MetricsPanel result={previewResult} sourceAnalysis={sourceAnalysis} />

      <section className="panel next-panel">
        <div className="panel-heading">
          <p className="eyebrow">Statut dev06</p>
          <h2>Smart Repair, historique Preview et UI Control Room</h2>
        </div>
        <p>
          Cette version fait basculer l’outil vers un vrai cockpit minimaliste : les réglages importants restent visibles, les versions sont traçables, les conseils sont actionnables, et le monitoring A/B reste central.
        </p>
        <p className="honest-note">
          Les mesures LUFS et true peak restent indicatives. La Preview Master est une version locale de comparaison à valider à l’écoute avant export.
        </p>
      </section>
    </main>
  );
}

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
import { MasterDashboard } from "./components/MasterDashboard";
import { ExportPanel } from "./components/ExportPanel";
import { MetricsPanel } from "./components/MetricsPanel";
import { RealtimeMonitorPanel } from "./components/RealtimeMonitorPanel";
import { PreviewControls } from "./components/PreviewControls";
import { ProcessingReportPanel } from "./components/ProcessingReportPanel";
import { SessionStatusPanel } from "./components/SessionStatusPanel";
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
    left.density === right.density
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
  const [appliedPreviewSettings, setAppliedPreviewSettings] =
    useState<PreviewSettings | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewResult, setPreviewResult] = useState<PreviewRenderResult | null>(null);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewRenderedAt, setPreviewRenderedAt] = useState<string | null>(null);
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
      setPreviewRenderedAt(null);
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
      setPreviewRenderedAt(null);
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

        const message =
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant le décodage audio.";

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

        const message =
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant l’analyse locale.";
        setAnalysisErrorMessage(message);
        setAnalysisStatus("error");
      }
    }

    void runAnalysis();

    return () => {
      isCurrentAudio = false;
    };
  }, [decodedAudio]);

  async function handleRenderPreview() {
    if (!decodedAudio?.audioBuffer || previewStatus === "rendering") {
      return;
    }

    player.stop();

    const nextRevision = previewRevision + 1;

    setPreviewStatus("rendering");
    setPreviewErrorMessage(null);
    setPreviewResult(null);
    setAppliedPreviewSettings(null);
    setPreviewRenderedAt(null);
    setShouldSelectPreviewAfterRender(true);

    try {
      const result = await renderPreviewMaster(decodedAudio.audioBuffer, previewSettings);
      setPreviewResult(result);
      setAppliedPreviewSettings({ ...previewSettings });
      setPreviewRevision(nextRevision);
      setPreviewRenderedAt(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        })
      );
      setPreviewStatus("ready");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue pendant la génération de la Preview Master.";

      setPreviewErrorMessage(message);
      setPreviewStatus("error");
      setShouldSelectPreviewAfterRender(false);
    }
  }

  useEffect(() => {
    if (previewStatus !== "ready" || !previewResult || !shouldSelectPreviewAfterRender) {
      return;
    }

    void player.switchSource("preview");
    setShouldSelectPreviewAfterRender(false);
  }, [player, previewResult, previewStatus, shouldSelectPreviewAfterRender]);

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="version">PAXLAB Browser Engine - dev05.2 Switch Guard</p>
          <h1>PAXLAB Browser Engine</h1>
          <p className="hero-text">
            Moteur navigateur local pour importer un fichier audio IA, analyser le fichier,
            générer une Preview Master en mémoire, comparer Original / Preview Master en A/B, puis exporter localement la version validée.
          </p>
        </div>

        <div className="privacy-card">
          <span>Confidentialité</span>
          <strong>Traitement local</strong>
          <p>
            Le fichier est lu, analysé et traité dans ton navigateur. Aucun upload serveur,
            aucune API externe, aucune base de données.
          </p>
        </div>
      </header>

      <div className="layout two-columns compact-top-layout">
        <UploadPanel
          selectedFile={selectedFile}
          isDecoding={decodeStatus === "loading"}
          onFileSelected={setSelectedFile}
        />

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

      {decodeStatus === "error" && decodeErrorMessage && (
        <p className="message message-error standalone-message">{decodeErrorMessage}</p>
      )}

      {analysisStatus === "running" && (
        <p className="message message-info standalone-message">
          Analyse locale en cours : niveau, spectre, stéréo et cible automatique.
        </p>
      )}

      {analysisStatus === "error" && analysisErrorMessage && (
        <p className="message message-error standalone-message">{analysisErrorMessage}</p>
      )}

      <MasterDashboard sourceAnalysis={sourceAnalysis} previewResult={previewResult} />

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

      <div className="layout three-columns control-room-layout">
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
      </div>

      <MetricsPanel result={previewResult} sourceAnalysis={sourceAnalysis} />

      <section className="panel next-panel">
        <div className="panel-heading">
          <p className="eyebrow">Statut dev05.2</p>
          <h2>Control Room, A/B sans pop et export local</h2>
        </div>

        <p>
          Cette version verrouille le flux de travail : session claire, lecture A/B, monitoring dynamique, génération traçable de la Preview Master et export WAV local de la version validée.
        </p>

        <p className="honest-note">
          L’export WAV est généré localement depuis la Preview en mémoire. La Preview Master reste une version de comparaison à valider à l’écoute. Les mesures LUFS, true peak et streaming check restent indicatives.
        </p>
      </section>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { analyzeSource } from "./audio/advancedAnalysis";
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
import { ABComparePanel } from "./components/ABComparePanel";
import { AudioInfoPanel } from "./components/AudioInfoPanel";
import { ListeningZonesPanel } from "./components/ListeningZonesPanel";
import { MasterDashboard } from "./components/MasterDashboard";
import { MetricsPanel } from "./components/MetricsPanel";
import { PlayerPanel } from "./components/PlayerPanel";
import { PreviewControls } from "./components/PreviewControls";
import { ProcessingReportPanel } from "./components/ProcessingReportPanel";
import { UploadPanel } from "./components/UploadPanel";
import { WaveformPanel } from "./components/WaveformPanel";

function areSettingsEqual(left: PreviewSettings | null, right: PreviewSettings): boolean {
  if (!left) {
    return false;
  }

  return (
    left.presetId === right.presetId &&
    left.highTreatment === right.highTreatment &&
    left.intensity === right.intensity &&
    left.targetRmsDb === right.targetRmsDb &&
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

    setPreviewStatus("rendering");
    setPreviewErrorMessage(null);

    try {
      const result = await renderPreviewMaster(decodedAudio.audioBuffer, previewSettings);
      setPreviewResult(result);
      setAppliedPreviewSettings({ ...previewSettings });
      setPreviewStatus("ready");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue pendant la génération de la Preview Master.";

      setPreviewErrorMessage(message);
      setPreviewStatus("error");
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="version">PAXLAB Browser Engine - dev03 XXL</p>
          <h1>PAXLAB Browser Engine</h1>
          <p className="hero-text">
            Moteur navigateur local pour importer un fichier audio IA, analyser les zones à vérifier,
            générer une Preview Master en mémoire, puis comparer Original / Preview Master en A/B.
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

      <div className="layout two-columns">
        <UploadPanel
          selectedFile={selectedFile}
          isDecoding={decodeStatus === "loading"}
          onFileSelected={setSelectedFile}
        />

        <AudioInfoPanel
          file={selectedFile}
          status={decodeStatus}
          audioInfo={decodedAudio?.info ?? null}
          errorMessage={decodeErrorMessage}
        />
      </div>

      {analysisStatus === "running" && (
        <p className="message message-info standalone-message">
          Analyse locale en cours : waveform, spectre, stéréo et zones d’écoute suggérées.
        </p>
      )}

      {analysisStatus === "error" && analysisErrorMessage && (
        <p className="message message-error standalone-message">{analysisErrorMessage}</p>
      )}

      <MasterDashboard sourceAnalysis={sourceAnalysis} previewResult={previewResult} />

      <div className="layout three-columns">
        <PreviewControls
          settings={previewSettings}
          previewStatus={previewStatus}
          hasAudio={Boolean(decodedAudio)}
          hasPreview={Boolean(previewResult)}
          hasPendingChanges={hasPendingChanges}
          errorMessage={previewErrorMessage}
          onSettingsChange={setPreviewSettings}
          onRenderPreview={() => void handleRenderPreview()}
        />

        <PlayerPanel
          activeSource={player.activeSource}
          currentTime={player.currentTime}
          duration={player.duration}
          isPlaying={player.isPlaying}
          canPlay={player.canPlayOriginal}
          onPlayPause={() => void player.playPause()}
          onSeek={player.seek}
        />

        <ABComparePanel
          activeSource={player.activeSource}
          canUsePreview={player.canPlayPreview}
          previewStatus={previewStatus}
          onSwitchSource={(source) => void player.switchSource(source)}
        />
      </div>

      <WaveformPanel
        originalBuffer={decodedAudio?.audioBuffer ?? null}
        previewBuffer={previewResult?.buffer ?? null}
        activeSource={player.activeSource}
        currentTime={player.currentTime}
        duration={player.duration}
        onSeek={player.seek}
      />

      <div className="layout two-columns wide-second">
        <ListeningZonesPanel analysis={sourceAnalysis} onSeek={player.seek} />
        <ProcessingReportPanel result={previewResult} />
      </div>

      <MetricsPanel result={previewResult} sourceAnalysis={sourceAnalysis} />

      <section className="panel next-panel">
        <div className="panel-heading">
          <p className="eyebrow">Statut dev03 XXL</p>
          <h2>Équivalent DEV 38, version navigateur</h2>
        </div>

        <p>
          Cette version reprend l’esprit de la V0.6 Streamlit : dashboard, zones d’écoute,
          Preview Master automatique, anti-fizz, de-click léger, contrôle stéréo, densité,
          niveau cible estimé et lecteur A/B synchronisé.
        </p>

        <p className="honest-note">
          Aucun export audio n’est proposé. La Preview Master est une version de comparaison
          générée localement, à valider à l’écoute. Les mesures LUFS, true peak et streaming
          check restent indicatives.
        </p>
      </section>
    </main>
  );
}

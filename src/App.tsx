import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { analyzeSource } from "./audio/advancedAnalysis";
import { buildSettingsFromAnalysis } from "./audio/autoTarget";
import { formatBytes, formatDuration } from "./audio/audioBufferUtils";
import { decodeAudioFile } from "./audio/decodeAudio";
import { DEFAULT_PREVIEW_SETTINGS } from "./audio/previewPresets";
import { renderPreviewMaster } from "./audio/renderPreviewMaster";
import { useABAudioPlayer } from "./audio/useABAudioPlayer";
import type {
  AdvancedAudioMetrics,
  AnalysisStatus,
  AutoIntensityId,
  DecodedAudioData,
  DecodeStatus,
  PreviewRenderResult,
  PreviewSettings,
  PreviewStatus,
  SourceAnalysisResult,
} from "./audio/types";
import { ExportPanel } from "./components/ExportPanel";
import { MasterDashboard } from "./components/MasterDashboard";
import { MetricsPanel } from "./components/MetricsPanel";
import { PreviewControls } from "./components/PreviewControls";
import {
  PreviewHistoryPanel,
  type PreviewHistoryItem,
} from "./components/PreviewHistoryPanel";
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
  "Préparation export",
];

const ANALYSIS_STEPS = [
  "Décodage audio",
  "Mesure du niveau",
  "Analyse spectrale",
  "Détection brillance IA",
  "Choix de la Preview recommandée",
];

function waitForVisualStep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const SIMPLE_RENDERS: Array<{
  id: AutoIntensityId;
  label: string;
  title: string;
  text: string;
}> = [
  {
    id: "safe",
    label: "Nettoyage léger",
    title: "Correction discrète",
    text: "Corrige doucement sans changer le caractère du morceau.",
  },
  {
    id: "balanced",
    label: "Traitement naturel",
    title: "Rendu stable et musical",
    text: "Rendu stable, musical, sans excès.",
  },
  {
    id: "impact",
    label: "Impact",
    title: "Plus fort et plus dense",
    text: "Basses plus présentes et rendu plus massif.",
  },
  {
    id: "youtube",
    label: "Mix YouTube",
    title: "Upload propre à -14 LUFS max",
    text: "Niveau stabilisé, peak prudent, grave et aigus IA contrôlés.",
  },
];


interface RecommendedPreviewPlan {
  settings: PreviewSettings;
  autoIntensity: AutoIntensityId;
  antiFatigue: boolean;
  label: string;
  reason: string;
}

function buildRecommendedPreviewPlan(metrics: AdvancedAudioMetrics): RecommendedPreviewPlan {
  const brightOrFizz =
    metrics.highTotalRatio > 0.38 ||
    metrics.fizzRatio > 0.065 ||
    metrics.brightnessRatio > 0.22;
  const clippedOrHot =
    metrics.clippingSamples > 25 || metrics.approxTruePeakDb > -0.45;
  const compact =
    metrics.crestFactorDb < 7.6 || metrics.loudnessRangeEstimate < 4.5;
  const lowLufsWithLimitedHeadroom =
    metrics.estimatedLufs <= -16.2 &&
    metrics.approxTruePeakDb > -8.5 &&
    metrics.crestFactorDb >= 8.2 &&
    metrics.loudnessRangeEstimate >= 4.2 &&
    !brightOrFizz &&
    !clippedOrHot;
  const quietAndDynamic =
    metrics.estimatedLufs <= -17.5 &&
    metrics.crestFactorDb >= 8.8 &&
    metrics.loudnessRangeEstimate >= 4.8 &&
    !brightOrFizz &&
    !clippedOrHot;
  const alreadySmooth =
    metrics.highTotalRatio < 0.29 &&
    metrics.fizzRatio < 0.045 &&
    metrics.estimatedLufs <= -13.8 &&
    !compact;

  let autoIntensity: AutoIntensityId = "youtube";
  let antiFatigue = brightOrFizz;
  let label = "Mix YouTube";
  let reason = "Sortie vidéo recommandée : niveau stabilisé, peak prudent et aigus IA contrôlés.";

  if (lowLufsWithLimitedHeadroom || quietAndDynamic) {
    autoIntensity = "impact";
    antiFatigue = false;
    label = "Impact";
    reason = lowLufsWithLimitedHeadroom
      ? "Niveau perçu bas avec des crêtes déjà présentes : PAXLAB recommande un rendu Power plus dense."
      : "Source basse et assez dynamique : PAXLAB recommande plus de densité avant validation A/B.";
  } else if (alreadySmooth) {
    autoIntensity = "balanced";
    antiFatigue = false;
    label = "Traitement naturel";
    reason = "Source déjà plutôt saine : traitement naturel conseillé, sans assombrir inutilement.";
  } else if (brightOrFizz) {
    autoIntensity = "youtube";
    antiFatigue = true;
    label = "Mix YouTube + AI Brightness Smoothing";
    reason = "Brillance IA ou fizz détecté : PAXLAB recommande le lissage des aigus pour une écoute plus confortable.";
  } else if (clippedOrHot || compact) {
    autoIntensity = "youtube";
    antiFatigue = false;
    label = "Mix YouTube";
    reason = "Source dense ou proche du plafond : rendu YouTube prudent recommandé avant export.";
  }

  const recommendedPresetId = autoIntensity === "youtube" ? "youtube" : autoIntensity === "impact" ? "power" : "auto";

  const settings = buildSettingsFromAnalysis(
    metrics,
    recommendedPresetId,
    {
      autoIntensity,
      antiFatigue,
      vocalPresence: false,
      stereoSpace: false,
      bassPunch: false,
      spacePreserve: false,
    },
  );

  return {
    settings,
    autoIntensity,
    antiFatigue,
    label,
    reason,
  };
}

const AUDIO_ACCEPT = "audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.aiff,.aif";
const MAX_AUDIO_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const LARGE_AUDIO_FILE_WARNING_BYTES = 50 * 1024 * 1024;

function isLikelySupportedAudioFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("audio/") ||
    [".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".aiff", ".aif"].some(
      (extension) => name.endsWith(extension),
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
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    element.isContentEditable
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPreviewMonitorGainDb(
  previewResult: PreviewRenderResult | null,
  equalVolume: boolean,
): number {
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


function normalizePresenceOptions(settings: PreviewSettings): PreviewSettings {
  const antiFatigue = Boolean(settings.antiFatigue);
  const bassPunch = Boolean(settings.bassPunch);
  const vocalPresence = antiFatigue || bassPunch ? false : Boolean(settings.vocalPresence);

  return {
    ...settings,
    antiFatigue,
    vocalPresence,
    stereoSpace: Boolean(settings.stereoSpace),
    bassPunch,
  };
}

function getSettingsSignature(settings: PreviewSettings | null): string {
  if (!settings) {
    return "";
  }

  return JSON.stringify(
    Object.entries(settings).sort(([leftKey], [rightKey]) =>
      leftKey.localeCompare(rightKey),
    ),
  );
}

function areSettingsEqual(
  left: PreviewSettings | null,
  right: PreviewSettings,
): boolean {
  return getSettingsSignature(left) === getSettingsSignature(right);
}

function vocalOptionLabel(settings: PreviewSettings): string {
  if (settings.antiFatigue) {
    return "AI Brightness Smoothing actif";
  }

  if (settings.vocalPresence) {
    return "Présence vocale active";
  }

  return "Option voix / fizz off";
}

function activeOptionLabel(settings: PreviewSettings): string {
  const options: string[] = [];

  if (settings.antiFatigue) {
    options.push("AI Brightness Smoothing");
  }

  if (settings.vocalPresence) {
    options.push("Présence vocale");
  }

  if (settings.stereoSpace) {
    options.push("Espace stéréo");
  }

  if (settings.bassPunch) {
    options.push("Basses punchy");
  }

  return options.length ? options.join(" · ") : "Options off";
}

function intensityLabel(value: AutoIntensityId): string {
  if (value === "safe") {
    return "Nettoyage léger";
  }

  if (value === "impact") {
    return "Impact";
  }

  if (value === "youtube") {
    return "Mix YouTube";
  }

  return "Traitement naturel";
}

function sourceAcceptsAudio(file: File): boolean {
  return validateAudioFileCandidate(file) === null;
}

function AnalysisOverlay({
  isVisible,
  activeStep,
  progress,
  isLargeFile,
}: {
  isVisible: boolean;
  activeStep: number;
  progress: number;
  isLargeFile: boolean;
}) {
  if (!isVisible) {
    return null;
  }

  const safeProgress = Math.min(100, Math.max(6, progress));
  const activeIndex = Math.min(
    ANALYSIS_STEPS.length - 1,
    Math.max(0, activeStep),
  );

  return (
    <div className="guided-processing-overlay analysis-processing-overlay" role="status" aria-live="polite">
      <div className="guided-processing-card processing-modal-premium analysis-processing-card">
        <div className="processing-logo-mark" aria-hidden="true">×</div>
        <p className="eyebrow">Analyse locale</p>
        <h2>Analyse du morceau</h2>
        <p>
          PAXLAB mesure le niveau, la brillance et la dynamique pour proposer une Preview adaptée.
          {isLargeFile && " Fichier volumineux : l'analyse peut prendre un peu plus de temps."}
        </p>
        <div
          className="guided-progress"
          style={{ "--progress": `${safeProgress}%` } as CSSProperties}
        >
          <span />
        </div>
        <strong>
          {Math.round(safeProgress)} % - {ANALYSIS_STEPS[activeIndex]}
        </strong>
        <div className="guided-processing-steps detailed-processing-steps analysis-processing-steps">
          {ANALYSIS_STEPS.map((step, index) => {
            const stateClass =
              index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
            return (
              <span key={step} className={stateClass}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <em>{step}</em>
                <small>
                  {index < activeIndex
                    ? "Terminé"
                    : index === activeIndex
                      ? "En cours"
                      : "En attente"}
                </small>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ProcessingOverlay({
  isVisible,
  activeStep,
  progress,
  previewStatus,
}: {
  isVisible: boolean;
  activeStep: number;
  progress: number;
  previewStatus: PreviewStatus;
}) {
  if (!isVisible || previewStatus === "error") {
    return null;
  }

  const safeProgress = Math.min(98, Math.max(6, progress));
  const activeIndex = Math.min(
    RENDER_STEPS.length - 1,
    Math.max(0, activeStep),
  );

  return (
    <div className="guided-processing-overlay" role="status" aria-live="polite">
      <div className="guided-processing-card processing-modal-premium">
        <div className="processing-logo-mark" aria-hidden="true">×</div>
        <p className="eyebrow">Traitement local</p>
        <h2>Préparation de la Preview</h2>
        <p>
          Le rendu est généré dans ton navigateur. Aucun serveur, aucun upload.
        </p>
        <div
          className="guided-progress"
          style={{ "--progress": `${safeProgress}%` } as CSSProperties}
        >
          <span />
        </div>
        <strong>
          {Math.round(safeProgress)} % - {RENDER_STEPS[activeIndex]}
        </strong>
        <div className="guided-processing-steps detailed-processing-steps">
          {RENDER_STEPS.map((step, index) => {
            const stateClass =
              index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
            return (
              <span key={step} className={stateClass}>
                <b>{String(index + 1).padStart(2, "0")}</b>
                <em>{step}</em>
                <small>
                  {index < activeIndex
                    ? "Terminé"
                    : index === activeIndex
                      ? "En cours"
                      : "En attente"}
                </small>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WorkflowStepper({
  step,
  analysisStatus,
}: {
  step: 1 | 2 | 3 | 4;
  analysisStatus: AnalysisStatus;
}) {
  const steps = [
    { id: 1, label: "Importer", help: "WAV ou MP3" },
    { id: 2, label: "Mixer", help: "Mix YouTube" },
    { id: 3, label: "Comparer", help: "A/B transparent" },
    { id: 4, label: "Exporter", help: "WAV / FLAC" },
  ];

  return (
    <section className="guided-stepper" aria-label="Workflow PAXLAB">
      {steps.map((item) => {
        const isLoading =
          item.id === 2 && analysisStatus === "running" && step === 2;
        const className = [
          "guided-step",
          step >= item.id ? "active" : "",
          isLoading ? "loading" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={item.id}
            className={className}
            aria-disabled={isLoading || undefined}
          >
            <b>{item.id}</b>
            <span>{item.label}</span>
            <small>{isLoading ? "Analyse..." : item.help}</small>
          </div>
        );
      })}
    </section>
  );
}


function buildStaticWaveformBars(buffer: AudioBuffer | null, bins = 180): Array<{ height: number }> {
  if (!buffer || buffer.length <= 0) {
    return [];
  }

  const channelCount = buffer.numberOfChannels;
  const step = Math.max(1, Math.floor(buffer.length / bins));
  const raw: number[] = [];

  for (let bin = 0; bin < bins; bin += 1) {
    const start = bin * step;
    const end = Math.min(buffer.length, start + step);
    let sumSquares = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let index = start; index < end; index += 1) {
        const sample = data[index] ?? 0;
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }

    raw.push(sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0);
  }

  const sorted = raw.filter((value) => value > 0.00001).sort((a, b) => a - b);
  const reference = Math.max(0.0008, sorted[Math.floor(sorted.length * 0.92)] ?? 0.0008);

  return raw.map((value, index) => {
    const previous = raw[index - 1] ?? value;
    const next = raw[index + 1] ?? value;
    const smooth = previous * 0.18 + value * 0.64 + next * 0.18;
    const normalized = Math.min(1, Math.pow(Math.min(3.2, smooth / reference), 0.72) * 0.72 + 0.08);
    return { height: Math.max(8, normalized * 88) };
  });
}

function formatChannelLabel(channelCount: number): string {
  if (channelCount === 1) {
    return "1 (Mono)";
  }

  if (channelCount === 2) {
    return "2 (Stéréo)";
  }

  return `${channelCount} canaux`;
}

function SourceLoadedCard({
  decodedAudio,
  analysisStatus,
  onFileSelected,
}: {
  decodedAudio: DecodedAudioData;
  analysisStatus: AnalysisStatus;
  onFileSelected: (file: File) => void;
}) {
  function handleChange(file: File | undefined) {
    if (!file || !sourceAcceptsAudio(file)) {
      return;
    }

    onFileSelected(file);
  }

  const sourceBars = buildStaticWaveformBars(decodedAudio.audioBuffer);
  const isFlacSource = decodedAudio.file.name.toLowerCase().endsWith(".flac");

  return (
    <section className="panel guided-source-card loaded-file-stage-card">
      <div className="loaded-file-header">
        <div className="loaded-file-icon" aria-hidden="true">♪</div>
        <div className="loaded-file-copy">
          <p className="eyebrow">Morceau chargé</p>
          <h2>{decodedAudio.file.name}</h2>
          <p>
            {formatDuration(decodedAudio.info.durationSeconds)} ·{" "}
            {decodedAudio.info.sampleRate.toLocaleString("fr-FR")} Hz ·{" "}
            {formatChannelLabel(decodedAudio.info.numberOfChannels)}
          </p>
        </div>
        <label className="secondary-file-button icon-button-label loaded-file-change">
          <span aria-hidden="true">↺</span>
          Changer de fichier
          <input
            type="file"
            accept={AUDIO_ACCEPT}
            onChange={(event) => {
              handleChange(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>

      <p className={`loaded-file-analysis-status ${analysisStatus}`}>
        {analysisStatus === "running"
          ? "Analyse locale en cours..."
          : analysisStatus === "ready"
            ? "Analyse locale terminée - Preview recommandée prête à générer à droite."
            : analysisStatus === "error"
              ? "Analyse locale indisponible - vérifie le fichier ou recharge-le."
              : "Analyse locale automatique après chargement."}
      </p>

      {decodedAudio.file.sizeBytes >= LARGE_AUDIO_FILE_WARNING_BYTES && (
        <p className="loaded-file-warning">
          Gros fichier : traitement 100 % local, quelques ralentissements restent possibles.
        </p>
      )}

      {isFlacSource && (
        <p className="loaded-file-warning">
          Source FLAC décodée par le navigateur. En cas d’échec sur un autre poste, utilise WAV ou MP3.
        </p>
      )}

      <div className="loaded-source-waveform" aria-hidden="true">
        {sourceBars.map((bar, index) => (
          <i key={index} style={{ height: `${bar.height}%` }} />
        ))}
      </div>

      <div className="loaded-file-metadata">
        <span>
          <small>Durée</small>
          <b>{formatDuration(decodedAudio.info.durationSeconds)}</b>
        </span>
        <span>
          <small>Fréquence d’échantillonnage</small>
          <b>{decodedAudio.info.sampleRate.toLocaleString("fr-FR")} Hz</b>
        </span>
        <span>
          <small>Canaux</small>
          <b>{formatChannelLabel(decodedAudio.info.numberOfChannels)}</b>
        </span>
        <span>
          <small>Format</small>
          <b>{decodedAudio.file.type || "Audio navigateur"}</b>
        </span>
      </div>
    </section>
  );
}



function RenderChoiceCard({
  settings,
  sourceAnalysis,
  analysisStatus,
  recommendedPlan,
  hasAudio,
  hasPreview,
  hasPendingChanges,
  previewStatus,
  previewErrorMessage,
  onSettingsChange,
  onRenderPreview,
}: {
  settings: PreviewSettings;
  sourceAnalysis: SourceAnalysisResult | null;
  analysisStatus: AnalysisStatus;
  recommendedPlan: RecommendedPreviewPlan | null;
  hasAudio: boolean;
  hasPreview: boolean;
  hasPendingChanges: boolean;
  previewStatus: PreviewStatus;
  previewErrorMessage: string | null;
  onSettingsChange: (settings: PreviewSettings) => void;
  onRenderPreview: () => void;
}) {
  const isRendering = previewStatus === "rendering";
  const canGenerate = hasAudio && analysisStatus === "ready" && Boolean(sourceAnalysis) && !isRendering;
  const isRecommendedSelection = Boolean(
    recommendedPlan &&
      settings.autoIntensity === recommendedPlan.autoIntensity &&
      settings.antiFatigue === recommendedPlan.antiFatigue &&
      !settings.vocalPresence &&
      !settings.stereoSpace &&
      !settings.bassPunch,
  );

  function rebuild(partial: Partial<PreviewSettings>) {
    const base = normalizePresenceOptions({
      ...settings,
      ...partial,
      antiFatigue: partial.antiFatigue ? true : partial.vocalPresence ? false : partial.antiFatigue ?? settings.antiFatigue,
      vocalPresence: partial.vocalPresence ? true : partial.antiFatigue || partial.bassPunch ? false : partial.vocalPresence ?? settings.vocalPresence,
      bassPunch: partial.bassPunch ? true : partial.vocalPresence ? false : partial.bassPunch ?? settings.bassPunch,
    });

    if (!sourceAnalysis) {
      onSettingsChange(base);
      return;
    }

    const rebuilt = buildSettingsFromAnalysis(
      sourceAnalysis.metrics,
      base.presetId,
      {
        autoIntensity: base.autoIntensity,
        antiFatigue: base.antiFatigue,
        vocalPresence: base.vocalPresence,
        stereoSpace: base.stereoSpace,
        bassPunch: base.bassPunch,
        spacePreserve: base.spacePreserve,
      },
    );

    onSettingsChange({
      ...rebuilt,
      presetId: base.presetId,
      autoIntensity: base.autoIntensity,
      antiFatigue: base.antiFatigue,
      vocalPresence: base.vocalPresence,
      stereoSpace: base.stereoSpace,
      bassPunch: base.bassPunch,
      spacePreserve: base.spacePreserve,
    });
  }

  const buttonLabel = isRendering
    ? "Préparation en cours..."
    : analysisStatus === "error"
      ? "Analyse indisponible"
      : analysisStatus !== "ready" || !sourceAnalysis
        ? "Analyse locale en cours..."
        : hasPreview
        ? hasPendingChanges
          ? "Régénérer la Preview"
          : "Générer une autre Preview"
        : isRecommendedSelection
          ? "Générer la Preview recommandée"
          : "Générer la Preview";

  return (
    <section id="paxlab-render-card" className="panel guided-render-card">
      <div className="guided-card-heading">
        <div>
          <p className="eyebrow">Rendu</p>
          <h2>Choisis le rendu</h2>
        </div>
        <span className="status-pill">{isRecommendedSelection ? "Recommandé" : recommendedPlan ? "Personnalisé" : "Analyse"}</span>
      </div>

      {recommendedPlan && (
        <div className="recommended-preview-note">
          <strong>Preview recommandée : {recommendedPlan.label}</strong>
          <span>{recommendedPlan.reason}</span>
        </div>
      )}

      <div className="guided-render-options" aria-label="Choix du rendu">
        {SIMPLE_RENDERS.map((render) => {
          const isActive = settings.autoIntensity === render.id;
          const isRecommended = recommendedPlan?.autoIntensity === render.id;
          const className = [
            "guided-render-option",
            isActive ? "active" : "",
            isRecommended ? "recommended" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={render.id}
              type="button"
              className={className}
              disabled={!hasAudio || isRendering || analysisStatus === "running"}
              onClick={() =>
                rebuild({
                  autoIntensity: render.id,
                  presetId: render.id === "youtube" ? "youtube" : render.id === "impact" ? "power" : "auto",
                })
              }
            >
              <strong>{render.label}</strong>
              <span>{render.title}</span>
              {isRecommended && <em>Recommandé</em>}
              <small>{render.text}</small>
            </button>
          );
        })}
      </div>

      <label
        className={[
          "guided-fatigue",
          settings.antiFatigue ? "active" : "",
          settings.vocalPresence ? "mutually-disabled" : "",
          recommendedPlan?.antiFatigue ? "recommended" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={settings.vocalPresence ? "Présence vocale active : désactive-la pour utiliser le lissage de brillance IA." : undefined}
      >
        <input
          type="checkbox"
          disabled={!hasAudio || isRendering || analysisStatus === "running" || settings.vocalPresence}
          checked={settings.antiFatigue}
          onChange={(event) => rebuild({ antiFatigue: event.target.checked, vocalPresence: event.target.checked ? false : settings.vocalPresence })}
        />
        <span>
          <strong>AI Brightness Smoothing</strong>
          <small>
            Calme les aigus métalliques, le fizz et la fatigue d’écoute.
          </small>
          {recommendedPlan?.antiFatigue && <em>Recommandé</em>}
        </span>
      </label>

      <label
        className={[
          "guided-fatigue",
          "guided-vocal-presence",
          settings.vocalPresence ? "active" : "",
          settings.antiFatigue ? "mutually-disabled" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={settings.antiFatigue ? "AI Brightness Smoothing actif : désactive-le pour utiliser la présence vocale." : undefined}
      >
        <input
          type="checkbox"
          disabled={!hasAudio || isRendering || analysisStatus === "running" || settings.antiFatigue}
          checked={settings.vocalPresence}
          onChange={(event) => rebuild({ vocalPresence: event.target.checked, antiFatigue: event.target.checked ? false : settings.antiFatigue })}
        />
        <span>
          <strong>Présence vocale</strong>
          <small>Fait ressortir légèrement le chant sans rendre les aigus agressifs.</small>
        </span>
      </label>

      <label
        className={[
          "guided-fatigue",
          "guided-stereo-space",
          settings.stereoSpace ? "active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <input
          type="checkbox"
          disabled={!hasAudio || isRendering || analysisStatus === "running"}
          checked={settings.stereoSpace}
          onChange={(event) => rebuild({ stereoSpace: event.target.checked })}
        />
        <span>
          <strong>Espace stéréo</strong>
          <small>Élargit légèrement l’image stéréo sans toucher aux graves.</small>
        </span>
      </label>

      <label
        className={[
          "guided-fatigue",
          "guided-bass-punch",
          settings.bassPunch ? "active" : "",
          settings.vocalPresence ? "mutually-disabled" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        title={settings.vocalPresence ? "Présence vocale active : désactive-la pour utiliser Basses punchy." : undefined}
      >
        <input
          type="checkbox"
          disabled={!hasAudio || isRendering || analysisStatus === "running" || settings.vocalPresence}
          checked={settings.bassPunch}
          onChange={(event) => rebuild({ bassPunch: event.target.checked, vocalPresence: event.target.checked ? false : settings.vocalPresence })}
        />
        <span>
          <strong>Basses punchy</strong>
          <small>Renforce le kick et le grave utile sans gonfler le mix.</small>
        </span>
      </label>

      <button
        type="button"
        className="primary-button guided-main-cta"
        disabled={!canGenerate}
        onClick={onRenderPreview}
      >
        {buttonLabel}
        <small>
          Analyse automatique, traitement local, validation à l’écoute
        </small>
      </button>

      {hasPendingChanges && hasPreview && (
        <p className="message message-warning">
          Les réglages ont changé. Régénère pour mettre la Preview à jour.
        </p>
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
  hasPendingChanges,
}: {
  previewResult: PreviewRenderResult;
  settings: PreviewSettings;
  revision: number;
  renderedAt: string | null;
  hasPendingChanges: boolean;
}) {
  const headroom =
    previewResult.report.loudness.headroomSummary?.finalHeadroomDb ??
    previewResult.report.loudness.achievedHeadroomDb;
  const label = intensityLabel(settings.autoIntensity);

  return (
    <section
      className={
        hasPendingChanges ? "guided-ready-card pending" : "guided-ready-card"
      }
    >
      <div>
        <p className="eyebrow">Preview prête</p>
        <h2>
          {hasPendingChanges
            ? "Preview à régénérer"
            : "Version de comparaison prête"}
        </h2>
        <p>
          Preview #{revision}
          {renderedAt ? ` · ${renderedAt}` : ""} · {label}
          {settings.antiFatigue ? " · AI Brightness Smoothing" : settings.vocalPresence ? " · Présence vocale" : ""}{settings.stereoSpace ? " · Espace stéréo" : ""}{settings.bassPunch ? " · Basses punchy" : ""}
        </p>
      </div>
      <div className="guided-ready-metrics">
        <span>
          <b>{previewResult.afterMetrics.estimatedLufs.toFixed(1)}</b> LUFS est.
        </span>
        <span>
          <b>{headroom.toFixed(1)}</b> dB marge
        </span>
        <span>
          <b>{hasPendingChanges ? "À jour ?" : "OK"}</b> statut
        </span>
      </div>
    </section>
  );
}

function signedNumber(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}`;
}

function brightnessRelativeChange(before: number, after: number): number {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) {
    return 0;
  }

  return ((after - before) / before) * 100;
}

function listeningLoudnessLabel(delta: number): string {
  if (delta <= -0.4) {
    return "Moins de pression sonore";
  }

  if (delta >= 0.4) {
    return "Niveau plus présent";
  }

  return "Niveau stable";
}

function listeningBrightnessLabel(deltaPercent: number): string {
  if (deltaPercent <= -8) {
    return "Aigus IA calmés";
  }

  if (deltaPercent >= 8) {
    return "Brillance plus ouverte";
  }

  return "Brillance stable";
}


function stereoSpaceValue(result: PreviewRenderResult): string {
  const value = result.report.stereoImage.changePercent;

  if (!result.settings.stereoSpace) {
    return "Standard";
  }

  if (!Number.isFinite(value) || Math.abs(value) < 0.5) {
    return "Stable";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} %`;
}

function stereoSpaceLabel(result: PreviewRenderResult): string {
  if (!result.settings.stereoSpace) {
    return "Option non activée";
  }

  if (Math.abs(result.report.stereoImage.lowChangePercent) <= 8) {
    return "Image élargie, graves protégés";
  }

  return "Image élargie, grave à contrôler";
}

function bassPunchValue(result: PreviewRenderResult): string {
  const value = result.report.bassPunch.changePercent;

  if (!result.settings.bassPunch || !result.report.bassPunch.active) {
    return "Off";
  }

  if (!Number.isFinite(value) || Math.abs(value) < 0.5) {
    return "Stable";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} %`;
}

function bassPunchLabel(result: PreviewRenderResult): string {
  if (!result.settings.bassPunch || !result.report.bassPunch.active) {
    return "Option non activée";
  }

  if (result.report.bassPunch.safeMode) {
    return "Dose réduite, grave déjà dense";
  }

  return "Kick renforcé, bas contrôlé";
}

function listeningDynamicsLabel(delta: number): string {
  if (delta >= -0.5) {
    return "Respiration préservée";
  }

  if (delta <= -1.2) {
    return "Rendu plus dense";
  }

  return "Dynamique contrôlée";
}

function PreviewChangeSummary({
  previewResult,
}: {
  previewResult: PreviewRenderResult;
}) {
  const loudnessDelta =
    previewResult.afterMetrics.estimatedLufs -
    previewResult.beforeMetrics.estimatedLufs;
  const brightnessDelta = brightnessRelativeChange(
    previewResult.beforeMetrics.fizzRatio,
    previewResult.afterMetrics.fizzRatio,
  );
  const dynamicsDelta =
    previewResult.afterMetrics.crestFactorDb -
    previewResult.beforeMetrics.crestFactorDb;
  const headroom =
    previewResult.report.loudness.headroomSummary?.finalHeadroomDb ??
    previewResult.report.loudness.achievedHeadroomDb;
  const brightnessValue =
    Math.abs(brightnessDelta) < 1
      ? "Stable"
      : `${brightnessDelta >= 0 ? "+" : ""}${brightnessDelta.toFixed(0)} %`;

  return (
    <section className="preview-change-summary" aria-label="Résumé auditif du rendu">
      <div className="preview-change-heading">
        <div>
          <p className="eyebrow">Ce que PAXLAB a changé</p>
          <h2>Lecture rapide avant export</h2>
        </div>
        <span>Mesures estimées</span>
      </div>
      <div className="preview-change-grid">
        <article>
          <span>Niveau perçu</span>
          <strong>{signedNumber(loudnessDelta)} LUFS</strong>
          <small>{listeningLoudnessLabel(loudnessDelta)}</small>
        </article>
        <article>
          <span>Brillance IA / fizz</span>
          <strong>{brightnessValue}</strong>
          <small>{listeningBrightnessLabel(brightnessDelta)} vs origine</small>
        </article>
        <article>
          <span>Marge peak</span>
          <strong>{headroom.toFixed(1)} dB</strong>
          <small>Sécurité export OK</small>
        </article>
        <article>
          {previewResult.settings.bassPunch ? (
            <>
              <span>Basses punchy</span>
              <strong>{bassPunchValue(previewResult)}</strong>
              <small>{bassPunchLabel(previewResult)}</small>
            </>
          ) : (
            <>
              <span>Respiration</span>
              <strong>{dynamicsDelta >= -0.5 ? "Préservée" : "Contrôlée"}</strong>
              <small>{listeningDynamicsLabel(dynamicsDelta)}</small>
            </>
          )}
        </article>
        <article>
          <span>Espace stéréo</span>
          <strong>{stereoSpaceValue(previewResult)}</strong>
          <small>{stereoSpaceLabel(previewResult)}</small>
        </article>
      </div>
    </section>
  );
}

function CompactStudioTopbar() {
  return (
    <header className="compact-studio-topbar compact-studio-topbar-minimal">
      <div className="compact-brand-block">
        <strong>PAXLAB</strong>
        <span>Browser Engine</span>
      </div>
      <div className="compact-topbar-actions">
        <div className="compact-trust-badges" aria-label="Garanties PAXLAB">
          <span>Local</span>
          <span>Aucun upload</span>
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
  hasPendingChanges,
}: {
  previewResult: PreviewRenderResult;
  settings: PreviewSettings;
  revision: number;
  renderedAt: string | null;
  hasPendingChanges: boolean;
}) {
  const headroom =
    previewResult.report.loudness.headroomSummary?.finalHeadroomDb ??
    previewResult.report.loudness.achievedHeadroomDb;
  const label = intensityLabel(settings.autoIntensity);

  return (
    <section
      className={
        hasPendingChanges
          ? "compact-preview-status pending"
          : "compact-preview-status"
      }
    >
      <strong>
        {hasPendingChanges
          ? "Preview à régénérer"
          : `Preview #${revision} prête`}
      </strong>
      <span>{label}</span>
      <span>
        {activeOptionLabel(settings)}
      </span>
      <span>
        {previewResult.afterMetrics.estimatedLufs.toFixed(1)} LUFS est.
      </span>
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
  onToggleModify,
}: {
  previewResult: PreviewRenderResult;
  settings: PreviewSettings;
  revision: number;
  renderedAt: string | null;
  hasPendingChanges: boolean;
  onToggleModify: () => void;
}) {
  const headroom =
    previewResult.report.loudness.headroomSummary?.finalHeadroomDb ??
    previewResult.report.loudness.achievedHeadroomDb;
  return (
    <section className="panel compact-side-summary">
      <p className="eyebrow">Preview</p>
      <h2>{hasPendingChanges ? "À régénérer" : `#${revision} prête`}</h2>
      <div className="compact-summary-grid">
        <span>
          <b>{intensityLabel(settings.autoIntensity)}</b>
          <small>Rendu</small>
        </span>
        <span>
          <b>{previewResult.afterMetrics.estimatedLufs.toFixed(1)}</b>
          <small>LUFS est.</small>
        </span>
        <span>
          <b>{headroom.toFixed(1)} dB</b>
          <small>Marge peak</small>
        </span>
      </div>
      <p>
        {renderedAt ? `Version générée à ${renderedAt}. ` : ""}
        {activeOptionLabel(settings)}.
      </p>
      <button
        type="button"
        className="secondary-action-button"
        onClick={onToggleModify}
      >
        Modifier le rendu
      </button>
    </section>
  );
}

function SimpleLanding({
  selectedFile,
  isDecoding,
  errorMessage,
  onFileSelected,
}: {
  selectedFile: File | null;
  isDecoding: boolean;
  errorMessage: string | null;
  onFileSelected: (file: File) => void;
}) {
  return (
    <>
      <header className="guided-landing-hero">
        <p className="version">
          PAXLAB Browser Engine - DEV15.28.7
        </p>
        <h1>Améliore tes morceaux. Sans serveur, sans upload.</h1>
        <p>
          Traitement audio professionnel dans ton navigateur. Compare l’original et le rendu en A/B avant d’exporter.
        </p>
        <div className="guided-trust-row">
          <span>Local</span>
          <span>Aucun upload</span>
          <span>A/B Original / Preview</span>
          <span>Export WAV / FLAC</span>
        </div>
      </header>

      <section className="guided-landing-grid">
        <UploadPanel
          selectedFile={selectedFile}
          isDecoding={isDecoding}
          onFileSelected={onFileSelected}
        />
        {errorMessage && (
          <p className="message message-error landing-error-message">
            {errorMessage}
          </p>
        )}
        <div className="panel guided-workflow-card">
          <p className="eyebrow">Workflow</p>
          <h2>Simple, rapide, contrôlé</h2>
          <ol>
            <li>
              <b>Importer</b>
              <span>Charge ton morceau IA.</span>
            </li>
            <li>
              <b>Mixer</b>
              <span>Preview recommandée automatiquement.</span>
            </li>
            <li>
              <b>Comparer</b>
              <span>Écoute Original / Preview en A/B.</span>
            </li>
            <li>
              <b>Exporter</b>
              <span>Récupère ton WAV ou FLAC local.</span>
            </li>
          </ol>
        </div>
      </section>
    </>
  );
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [decodeStatus, setDecodeStatus] = useState<DecodeStatus>("idle");
  const [decodedAudio, setDecodedAudio] = useState<DecodedAudioData | null>(
    null,
  );
  const [decodeErrorMessage, setDecodeErrorMessage] = useState<string | null>(
    null,
  );

  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [sourceAnalysis, setSourceAnalysis] =
    useState<SourceAnalysisResult | null>(null);
  const [analysisErrorMessage, setAnalysisErrorMessage] = useState<
    string | null
  >(null);

  const [previewSettings, setPreviewSettings] = useState<PreviewSettings>({
    ...DEFAULT_PREVIEW_SETTINGS,
  });
  const [appliedPreviewSettings, setAppliedPreviewSettings] =
    useState<PreviewSettings | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewResult, setPreviewResult] =
    useState<PreviewRenderResult | null>(null);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(
    null,
  );
  const [previewRevision, setPreviewRevision] = useState(0);
  const [previewCounter, setPreviewCounter] = useState(0);
  const [previewRenderedAt, setPreviewRenderedAt] = useState<string | null>(
    null,
  );
  const [previewHistory, setPreviewHistory] = useState<PreviewHistoryItem[]>(
    [],
  );
  const [shouldSelectPreviewAfterRender, setShouldSelectPreviewAfterRender] =
    useState(false);
  const [showRenderEditor, setShowRenderEditor] = useState(false);
  const [renderProgressStep, setRenderProgressStep] = useState(0);
  const [renderProgressValue, setRenderProgressValue] = useState(6);
  const [exportedRevision, setExportedRevision] = useState<number | null>(null);
  const [analysisOverlayVisible, setAnalysisOverlayVisible] = useState(false);
  const [analysisVisualStep, setAnalysisVisualStep] = useState(0);
  const [analysisVisualProgress, setAnalysisVisualProgress] = useState(6);
  const exportPanelRef = useRef<HTMLDivElement | null>(null);
  const [monitorEqualVolume, setMonitorEqualVolume] = useState(false);
  const renderTokenRef = useRef(0);
  const renderInFlightRef = useRef(false);
  const analysisTokenRef = useRef(0);

  const previewMonitorGainDb = useMemo(
    () => getPreviewMonitorGainDb(previewResult, monitorEqualVolume),
    [monitorEqualVolume, previewResult],
  );

  const player = useABAudioPlayer({
    originalBuffer: decodedAudio?.audioBuffer ?? null,
    previewBuffer: previewResult?.buffer ?? null,
    monitorGainDbBySource: {
      original: 0,
      preview: previewMonitorGainDb,
    },
  });

  const hasPendingChanges = useMemo(
    () =>
      Boolean(previewResult) &&
      !areSettingsEqual(appliedPreviewSettings, previewSettings),
    [appliedPreviewSettings, previewResult, previewSettings],
  );

  const recommendedPlan = useMemo(
    () =>
      sourceAnalysis
        ? buildRecommendedPreviewPlan(sourceAnalysis.metrics)
        : null,
    [sourceAnalysis],
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
      setAnalysisOverlayVisible(false);
      setAnalysisVisualStep(0);
      setAnalysisVisualProgress(6);
      renderTokenRef.current += 1;
      analysisTokenRef.current += 1;
      return;
    }

    let isCurrentFile = true;

    async function runDecode() {
      const decodeToken = analysisTokenRef.current + 1;
      analysisTokenRef.current = decodeToken;
      setAnalysisOverlayVisible(true);
      setAnalysisVisualStep(0);
      setAnalysisVisualProgress(8);
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
        const validationMessage = validateAudioFileCandidate(
          selectedFile as File,
        );
        if (validationMessage) {
          throw new Error(validationMessage);
        }

        const decoded = await decodeAudioFile(selectedFile as File);

        if (!isCurrentFile) {
          return;
        }

        setAnalysisVisualStep(1);
        setAnalysisVisualProgress(24);
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
        setAnalysisOverlayVisible(false);
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
      const analysisToken = analysisTokenRef.current + 1;
      analysisTokenRef.current = analysisToken;
      const isActiveAnalysis = () =>
        isCurrentAudio && analysisToken === analysisTokenRef.current;

      setAnalysisStatus("running");
      setSourceAnalysis(null);
      setAnalysisErrorMessage(null);
      setAnalysisOverlayVisible(true);
      setAnalysisVisualStep(1);
      setAnalysisVisualProgress(32);

      const startedAt = performance.now();

      try {
        await waitForVisualStep(180);
        if (!isActiveAnalysis()) {
          return;
        }

        setAnalysisVisualStep(2);
        setAnalysisVisualProgress(50);
        const result = analyzeSource(buffer);

        if (!isActiveAnalysis()) {
          return;
        }

        await waitForVisualStep(220);
        if (!isActiveAnalysis()) {
          return;
        }

        setAnalysisVisualStep(3);
        setAnalysisVisualProgress(68);
        await waitForVisualStep(220);
        if (!isActiveAnalysis()) {
          return;
        }

        const recommended = buildRecommendedPreviewPlan(result.metrics);
        setAnalysisVisualStep(4);
        setAnalysisVisualProgress(86);

        const elapsed = performance.now() - startedAt;
        await waitForVisualStep(Math.max(180, 1150 - elapsed));
        if (!isActiveAnalysis()) {
          return;
        }

        setSourceAnalysis(result);
        setPreviewSettings(normalizePresenceOptions({ ...recommended.settings }));
        setAnalysisStatus("ready");
        setAnalysisVisualProgress(100);

        window.setTimeout(() => {
          if (isActiveAnalysis()) {
            setAnalysisOverlayVisible(false);
          }
        }, 280);
      } catch (error) {
        if (!isActiveAnalysis()) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant l’analyse locale.";
        setAnalysisErrorMessage(message);
        setAnalysisStatus("error");
        setAnalysisOverlayVisible(false);
      }
    }

    void runAnalysis();

    return () => {
      isCurrentAudio = false;
    };
  }, [decodedAudio]);

  const handleRenderPreview = useCallback(
    async (settingsOverride?: PreviewSettings) => {
      if (
        !decodedAudio?.audioBuffer ||
        !sourceAnalysis ||
        analysisStatus !== "ready" ||
        renderInFlightRef.current ||
        previewStatus === "rendering"
      ) {
        return;
      }

      renderInFlightRef.current = true;
      const settingsToRender = normalizePresenceOptions(
        settingsOverride ? { ...settingsOverride } : { ...previewSettings },
      );
      const renderToken = renderTokenRef.current + 1;
      renderTokenRef.current = renderToken;

      player.stop();

      const nextRevision = previewCounter + 1;

      setPreviewSettings(normalizePresenceOptions(settingsToRender));
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
        const result = await renderPreviewMaster(
          decodedAudio.audioBuffer,
          settingsToRender,
          (event) => {
            if (renderToken !== renderTokenRef.current) {
              return;
            }
            setRenderProgressStep(event.stepIndex);
            setRenderProgressValue(event.progress);
          },
        );
        if (renderToken !== renderTokenRef.current) {
          renderInFlightRef.current = false;
          return;
        }

        const renderedAt = new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const historyItem: PreviewHistoryItem = {
          id: nextRevision,
          renderedAt,
          result,
          settings: { ...settingsToRender },
        };

        setPreviewResult(result);
        setAppliedPreviewSettings(normalizePresenceOptions({ ...settingsToRender }));
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
          renderInFlightRef.current = false;
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Erreur inconnue pendant la génération de la Preview Master.";
        setPreviewErrorMessage(message);
        setPreviewStatus("error");
        setShouldSelectPreviewAfterRender(false);
      } finally {
        renderInFlightRef.current = false;
      }
    },
    [
      analysisStatus,
      decodedAudio?.audioBuffer,
      player,
      previewCounter,
      previewSettings,
      previewStatus,
      sourceAnalysis,
    ],
  );

  function handleSelectHistory(item: PreviewHistoryItem) {
    player.stop();
    setPreviewResult(item.result);
    setPreviewSettings(normalizePresenceOptions({ ...item.settings }));
    setAppliedPreviewSettings(normalizePresenceOptions({ ...item.settings }));
    setPreviewRevision(item.id);
    setPreviewRenderedAt(item.renderedAt);
    setPreviewStatus("ready");
    setPreviewErrorMessage(null);
    setShouldSelectPreviewAfterRender(true);
    setExportedRevision(null);
  }

  function handleApplyRecommended(settings: PreviewSettings) {
    player.stop();
    setPreviewSettings(normalizePresenceOptions({ ...settings }));
  }

  useEffect(() => {
    if (
      previewStatus !== "ready" ||
      !previewResult ||
      !shouldSelectPreviewAfterRender
    ) {
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
      setSelectedFile(null);
      setDecodedAudio(null);
      setDecodeStatus("error");
      setDecodeErrorMessage(validationMessage);
      setAnalysisStatus("idle");
      setSourceAnalysis(null);
      setAnalysisErrorMessage(null);
      setPreviewStatus("idle");
      setPreviewResult(null);
      setAnalysisOverlayVisible(false);
      setExportedRevision(null);
      return;
    }

    setSelectedFile(file);
  }

  function handleScrollToRender() {
    document.getElementById("paxlab-render-card")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleScrollToExport() {
    exportPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
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
        void player.switchSource(
          player.activeSource === "preview" ? "original" : "preview",
        );
        return;
      }

      if (
        key === "r" &&
        decodedAudio &&
        sourceAnalysis &&
        analysisStatus === "ready" &&
        previewStatus !== "rendering"
      ) {
        event.preventDefault();
        handleScrollToRender();
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
  }, [analysisStatus, decodedAudio, handleRenderPreview, player, previewResult, previewStatus, sourceAnalysis]);

  const workflowStep: 1 | 2 | 3 | 4 = !decodedAudio
    ? 1
    : !hasPendingChanges &&
        exportedRevision &&
        previewRevision > 0 &&
        exportedRevision === previewRevision
      ? 4
      : previewResult
        ? 3
        : 2;
  const readySettings = previewResult?.settings ?? previewSettings;

  return (
    <main className="guided-shell">
      <AnalysisOverlay
        isVisible={analysisOverlayVisible && previewStatus !== "rendering"}
        activeStep={analysisVisualStep}
        progress={analysisVisualProgress}
        isLargeFile={Boolean(selectedFile && selectedFile.size >= LARGE_AUDIO_FILE_WARNING_BYTES)}
      />
      <ProcessingOverlay
        isVisible={previewStatus === "rendering"}
        activeStep={renderProgressStep}
        progress={renderProgressValue}
        previewStatus={previewStatus}
      />

      <CompactStudioTopbar />

      {!decodedAudio && (
        <SimpleLanding
          selectedFile={selectedFile}
          isDecoding={decodeStatus === "loading"}
          errorMessage={decodeErrorMessage}
          onFileSelected={handleSelectFile}
        />
      )}

      {decodedAudio && (
        <>
          {decodeStatus === "error" && decodeErrorMessage && (
            <p className="message message-error standalone-message">
              {decodeErrorMessage}
            </p>
          )}
          {analysisStatus === "running" && (
            <p className="message message-info standalone-message">
              Analyse locale en cours : niveau, spectre et cible automatique.
            </p>
          )}
          {analysisStatus === "error" && analysisErrorMessage && (
            <p className="message message-error standalone-message">
              {analysisErrorMessage}
            </p>
          )}

          {!previewResult && (
            <section className="guided-config-grid loaded-layout-grid">
              <div className="loaded-main-column">
                <SourceLoadedCard
                  decodedAudio={decodedAudio}
                  analysisStatus={analysisStatus}
                  onFileSelected={handleSelectFile}
                />
              </div>
              <aside className="loaded-side-column">
                <RenderChoiceCard
                  settings={previewSettings}
                  sourceAnalysis={sourceAnalysis}
                  analysisStatus={analysisStatus}
                  recommendedPlan={recommendedPlan}
                  hasAudio={Boolean(decodedAudio)}
                  hasPreview={Boolean(previewResult)}
                  hasPendingChanges={hasPendingChanges}
                  previewStatus={previewStatus}
                  previewErrorMessage={previewErrorMessage}
                  onSettingsChange={(settings) => setPreviewSettings(normalizePresenceOptions(settings))}
                  onRenderPreview={() => void handleRenderPreview()}
                />

                <details className="guided-accordion side-technical-drawer">
                  <summary>
                    <span>Détails techniques</span>
                    <small>Informations sur l’analyse et le traitement.</small>
                  </summary>
                </details>
              </aside>
            </section>
          )}

          {previewResult && (
            <>
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
                    onSwitchSource={(source) =>
                      void player.switchSource(source)
                    }
                    onFileSelected={handleSelectFile}
                    equalVolume={monitorEqualVolume}
                    onToggleEqualVolume={() =>
                      setMonitorEqualVolume((value) => !value)
                    }
                  />
                  <PreviewChangeSummary previewResult={previewResult} />
                </div>

                <aside className="guided-result-side compact-side-panel">
                  <RenderChoiceCard
                    settings={previewSettings}
                    sourceAnalysis={sourceAnalysis}
                    analysisStatus={analysisStatus}
                    recommendedPlan={recommendedPlan}
                    hasAudio={Boolean(decodedAudio)}
                    hasPreview={Boolean(previewResult)}
                    hasPendingChanges={hasPendingChanges}
                    previewStatus={previewStatus}
                    previewErrorMessage={previewErrorMessage}
                    onSettingsChange={(settings) => setPreviewSettings(normalizePresenceOptions(settings))}
                    onRenderPreview={() => void handleRenderPreview()}
                  />
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
                      onRegenerateRequest={handleScrollToRender}
                    />
                  </div>
                </aside>
              </section>
            </>
          )}

          <section className="guided-accordions">
            {previewHistory.length > 0 && (
              <details className="guided-accordion">
                <summary>
                  <span>Historique des previews</span>
                  <small>
                    {previewHistory.length} version
                    {previewHistory.length > 1 ? "s" : ""} comparable
                    {previewHistory.length > 1 ? "s" : ""}
                  </small>
                </summary>
                <PreviewHistoryPanel
                  items={previewHistory}
                  activeRevision={previewRevision}
                  isRendering={previewStatus === "rendering"}
                  onSelect={handleSelectHistory}
                />
              </details>
            )}

            <details id="paxlab-expert-settings" className="guided-accordion">
              <summary>
                <span>Réglages experts</span>
                <small>
                  Préserver l’espace, intensité, plafond peak et nettoyage
                  source
                </small>
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
                onSettingsChange={(settings) => setPreviewSettings(normalizePresenceOptions(settings))}
                onRenderPreview={() => void handleRenderPreview()}
              />
            </details>

            <details className="guided-accordion">
              <summary>
                <span>Détails techniques</span>
                <small>
                  Conseil automatique, rapport de traitement et mesures
                </small>
              </summary>
              <div className="guided-details-grid">
                <SmartAdvisorPanel
                  sourceAnalysis={sourceAnalysis}
                  previewResult={previewResult}
                  settings={previewSettings}
                  isRendering={previewStatus === "rendering"}
                  onApplySettings={handleApplyRecommended}
                />
                <MasterDashboard
                  sourceAnalysis={sourceAnalysis}
                  previewResult={previewResult}
                  previewSettings={previewSettings}
                />
                <ProcessingReportPanel result={previewResult} />
                <MetricsPanel
                  result={previewResult}
                  sourceAnalysis={sourceAnalysis}
                />
              </div>
            </details>
          </section>
        </>
      )}

      <p className="ux-footer-note guided-footer-note">
        Mesures indicatives navigateur. Preview locale de comparaison, à valider
        à l’écoute.
      </p>
    </main>
  );
}

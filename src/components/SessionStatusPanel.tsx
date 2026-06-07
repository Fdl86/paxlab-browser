import { inferAutoMasterPlan } from "../audio/autoTarget";
import { formatBytes, formatDuration, formatNumber } from "../audio/audioBufferUtils";
import type {
  DecodedAudioData,
  PreviewRenderResult,
  PreviewSettings,
  PreviewStatus,
  SourceAnalysisResult
} from "../audio/types";

interface SessionStatusPanelProps {
  decodedAudio: DecodedAudioData | null;
  sourceAnalysis: SourceAnalysisResult | null;
  previewResult: PreviewRenderResult | null;
  previewSettings: PreviewSettings;
  previewStatus: PreviewStatus;
  previewRevision: number;
  previewRenderedAt: string | null;
  hasPendingChanges: boolean;
}

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS est.`;
}

function previewLabel(
  previewStatus: PreviewStatus,
  previewRevision: number,
  previewRenderedAt: string | null,
  hasPendingChanges: boolean
): string {
  if (previewStatus === "rendering") {
    return "Rendu en cours";
  }

  if (previewRevision <= 0) {
    return "Non générée";
  }

  const time = previewRenderedAt ? ` · ${previewRenderedAt}` : "";
  const stale = hasPendingChanges ? " · réglages modifiés" : " · à jour";
  return `Preview Master #${previewRevision}${time}${stale}`;
}

export function SessionStatusPanel({
  decodedAudio,
  sourceAnalysis,
  previewResult,
  previewSettings,
  previewStatus,
  previewRevision,
  previewRenderedAt,
  hasPendingChanges
}: SessionStatusPanelProps) {
  const file = decodedAudio?.file ?? null;
  const info = decodedAudio?.info ?? null;
  const activeSettings = previewResult?.settings ?? previewSettings;
  const plan = sourceAnalysis ? inferAutoMasterPlan(sourceAnalysis.metrics, {
    autoIntensity: activeSettings.autoIntensity,
    antiFatigue: activeSettings.antiFatigue
  }) : null;
  const target = activeSettings.targetLufsEstimate;
  const ceiling = activeSettings.maxPeakDb;
  const sourceLufs = sourceAnalysis?.metrics.estimatedLufs ?? null;

  return (
    <section className="panel session-panel">
      <div className="panel-heading">
        <p className="eyebrow">Session locale</p>
        <h2>État du travail</h2>
      </div>

      {!decodedAudio && (
        <div className="empty-state small-empty-state">
          <p>Aucun morceau chargé.</p>
          <span>Importe un fichier WAV ou MP3 pour lancer l’analyse locale.</span>
        </div>
      )}

      {decodedAudio && (
        <div className="session-grid">
          <div className="session-card large-session-card">
            <span>Morceau</span>
            <strong>{file?.name ?? "Fichier local"}</strong>
            <small>
              {info ? `${formatDuration(info.durationSeconds)} · ${formatNumber(info.sampleRate)} Hz · ${info.numberOfChannels} canal${info.numberOfChannels > 1 ? "x" : ""}` : "Décodage local"}
            </small>
          </div>

          <div className="session-card">
            <span>Plan auto</span>
            <strong>{plan?.profileLabel ?? "Analyse"}</strong>
            <small>{sourceLufs !== null ? `Source : ${formatLufs(sourceLufs)}` : "En attente"}</small>
          </div>

          <div className="session-card">
            <span>Cible / Headroom</span>
            <strong>{plan ? `${plan.targetLufsMinEstimate.toFixed(1)} à ${plan.targetLufsMaxEstimate.toFixed(1)} LUFS` : formatLufs(target)}</strong>
            <small>{plan ? `Headroom ${plan.targetHeadroomMinDb.toFixed(1)} à ${plan.targetHeadroomMaxDb.toFixed(1)} dB` : `Ceiling ${ceiling.toFixed(1)} dBTP est.`}</small>
          </div>

          <div className={hasPendingChanges ? "session-card warning-session-card" : "session-card success-session-card"}>
            <span>Preview</span>
            <strong>{previewLabel(previewStatus, previewRevision, previewRenderedAt, hasPendingChanges)}</strong>
            <small>{previewResult ? "Version générée en mémoire" : "Aucun rendu pour l’instant"}</small>
          </div>
        </div>
      )}
    </section>
  );
}

import { inferAutoMasterPlan } from "../audio/autoTarget";
import { formatDuration } from "../audio/audioBufferUtils";
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

function formatPreview(
  previewStatus: PreviewStatus,
  previewRevision: number,
  previewRenderedAt: string | null,
  hasPendingChanges: boolean
): string {
  if (previewStatus === "rendering") {
    return "Génération en cours";
  }

  if (previewRevision <= 0) {
    return "Pas encore";
  }

  if (hasPendingChanges) {
    return `#${previewRevision} à mettre à jour`;
  }

  return `#${previewRevision}${previewRenderedAt ? ` · ${previewRenderedAt}` : ""}`;
}

function formatPreset(settings: PreviewSettings): string {
  const base = settings.autoIntensity === "impact" ? "Impact" : settings.autoIntensity === "safe" ? "Propre" : "Équilibré";
  return settings.antiFatigue ? `${base} + anti-fatigue` : base;
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
  const info = decodedAudio?.info ?? null;
  const activeSettings = previewResult?.settings ?? previewSettings;
  const plan = sourceAnalysis ? inferAutoMasterPlan(sourceAnalysis.metrics, {
    autoIntensity: activeSettings.autoIntensity,
    antiFatigue: activeSettings.antiFatigue
  }) : null;

  return (
    <section className="panel session-panel command-summary-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Résumé</p>
          <h2>Ce que PAXLAB va faire</h2>
        </div>
        <span className={previewResult && !hasPendingChanges ? "status-pill ready-pill" : "status-pill"}>
          {previewResult && !hasPendingChanges ? "Prêt" : decodedAudio ? "En cours" : "Attente"}
        </span>
      </div>

      {!decodedAudio && (
        <div className="empty-state small-empty-state friendly-empty-state">
          <p>Commence par importer un morceau.</p>
          <span>Ensuite, choisis simplement Propre, Équilibré ou Impact.</span>
        </div>
      )}

      {decodedAudio && (
        <div className="simple-status-list">
          <div>
            <span>Morceau</span>
            <strong>{decodedAudio.file.name}</strong>
            <small>{info ? `${formatDuration(info.durationSeconds)} · ${info.numberOfChannels} canal${info.numberOfChannels > 1 ? "x" : ""}` : "Décodage local"}</small>
          </div>

          <div>
            <span>Rendu choisi</span>
            <strong>{formatPreset(activeSettings)}</strong>
            <small>{plan ? `${plan.profileLabel} · ${plan.targetLufsMinEstimate.toFixed(1)} à ${plan.targetLufsMaxEstimate.toFixed(1)} LUFS` : "Analyse en cours"}</small>
          </div>

          <div>
            <span>Preview</span>
            <strong>{formatPreview(previewStatus, previewRevision, previewRenderedAt, hasPendingChanges)}</strong>
            <small>{previewResult ? `${formatLufs(previewResult.afterMetrics.estimatedLufs)} · HR ${(previewResult.report.loudness.headroomSummary?.finalHeadroomDb ?? previewResult.report.loudness.achievedHeadroomDb).toFixed(1)} dB` : "Clique sur Générer pour créer la version A/B"}</small>
          </div>
        </div>
      )}
    </section>
  );
}

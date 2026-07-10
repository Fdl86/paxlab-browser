import type { CSSProperties } from "react";
import { formatDb } from "../audio/audioBufferUtils";
import type { PreviewRenderResult, SourceAnalysisResult } from "../audio/types";

interface MetricsPanelProps {
  result: PreviewRenderResult | null;
  sourceAnalysis: SourceAnalysisResult | null;
}

function formatRatio(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function formatStereoRatio(value: number): string {
  return value.toFixed(3);
}

function formatStereoPercent(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) {
    return "Stable";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} %`;
}

function formatBassPunchPercent(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.5) {
    return "Stable";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)} %`;
}

function formatBassPunchRatio(value: number): string {
  return `${(value * 100).toFixed(1)} %`;
}

function normalizeBassPunchRatio(value: number): number {
  return clampPercent((value / 0.6) * 100);
}

function brightnessRelativeChange(before: number, after: number): number {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) {
    return 0;
  }

  return ((after - before) / before) * 100;
}

function formatBrightnessDelta(before: number, after: number): string {
  const relativeChange = brightnessRelativeChange(before, after);

  if (Math.abs(relativeChange) < 1) {
    return "Stable";
  }

  return `${relativeChange >= 0 ? "+" : ""}${relativeChange.toFixed(0)} % vs origine`;
}

function formatLufs(value: number): string {
  return `${value.toFixed(1)} LUFS est.`;
}

function formatDelta(value: number, suffix = ""): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}${suffix}`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function normalizeLufs(value: number): number {
  return clampPercent(((value + 18) / 6) * 100);
}

function normalizePeak(value: number): number {
  return clampPercent(((value + 12) / 12) * 100);
}

function normalizePercent(value: number): number {
  return clampPercent(value * 2600);
}

function normalizeStereoRatio(value: number): number {
  return clampPercent(((value - 0.25) / 0.35) * 100);
}

function normalizeCrest(value: number, isYoutubeMix = false, isImpact = false): number {
  if (isYoutubeMix) {
    return clampPercent(((value - 10) / 12) * 100);
  }

  if (isImpact) {
    return clampPercent(((value - 7) / 8) * 100);
  }

  return clampPercent(((value - 7) / 10) * 100);
}

function loudnessListeningLabel(before: number, after: number): string {
  const delta = after - before;

  if (delta <= -0.4) {
    return "Moins de pression sonore";
  }

  if (delta >= 0.4) {
    return "Niveau plus présent";
  }

  return "Niveau perçu stable";
}

function peakListeningLabel(before: number, after: number): string {
  const delta = after - before;

  if (delta >= 0.5) {
    return "Crêtes plus libres";
  }

  if (delta <= -0.5) {
    return "Peak calmé";
  }

  return "Peak stable";
}

function brightnessListeningLabel(before: number, after: number): string {
  const relativeChange = brightnessRelativeChange(before, after);

  if (relativeChange <= -8) {
    return "Aigus IA calmés";
  }

  if (relativeChange >= 8) {
    return "Brillance plus ouverte";
  }

  return "Brillance stable";
}

function dynamicsListeningLabel(before: number, after: number): string {
  const delta = after - before;

  if (delta >= -0.5) {
    return "Respiration préservée";
  }

  if (delta <= -1.2) {
    return "Rendu plus dense";
  }

  return "Dynamique contrôlée";
}

function stereoListeningLabel(result: PreviewRenderResult): string {
  const summary = result.report.stereoImage;

  if (!result.settings.stereoSpace) {
    return "Image conservée";
  }

  if (summary.changePercent >= 4 && Math.abs(summary.lowChangePercent) <= 8) {
    return "Image élargie, graves protégés";
  }

  if (summary.changePercent >= 2) {
    return "Ouverture légère";
  }

  return "Effet discret";
}

function bassListeningLabel(result: PreviewRenderResult): string {
  if (result.settings.bassPunch && result.report.bassPunch.active) {
    return result.report.bassPunch.safeMode ? "basses renforcées avec dose réduite" : "kick renforcé et bas contrôlé";
  }

  const before = result.beforeMetrics.subRatio + result.beforeMetrics.lowRatio;
  const after = result.afterMetrics.subRatio + result.afterMetrics.lowRatio;
  const delta = after - before;

  if (delta >= 0.01) {
    return "Assise grave renforcée";
  }

  if (delta <= -0.01) {
    return "Grave allégé";
  }

  return "Grave stable";
}

function buildListeningSummary(result: PreviewRenderResult): string {
  const loudness = loudnessListeningLabel(result.beforeMetrics.estimatedLufs, result.afterMetrics.estimatedLufs);
  const brightness = brightnessListeningLabel(result.beforeMetrics.fizzRatio, result.afterMetrics.fizzRatio);
  const dynamics = dynamicsListeningLabel(result.beforeMetrics.crestFactorDb, result.afterMetrics.crestFactorDb);
  const bass = bassListeningLabel(result);

  const stereo = result.settings.stereoSpace ? `, ${stereoListeningLabel(result).toLowerCase()}` : "";

  return `${loudness}, ${brightness.toLowerCase()}, ${bass.toLowerCase()}, ${dynamics.toLowerCase()}${stereo}.`;
}

function ComparisonRow({
  label,
  original,
  preview,
  delta,
  listening,
  originalScore,
  previewScore,
  scale
}: {
  label: string;
  original: string;
  preview: string;
  delta: string;
  listening: string;
  originalScore: number;
  previewScore: number;
  scale: string;
}) {
  return (
    <article className="technical-row">
      <div className="technical-row-label">
        <strong>{label}</strong>
        <small>{listening}</small>
      </div>
      <div className="technical-row-bars">
        <div className="technical-bar original" style={{ "--value": `${originalScore}%` } as CSSProperties}>
          <span>Original</span>
          <i />
          <b>{original}</b>
        </div>
        <div className="technical-bar preview" style={{ "--value": `${previewScore}%` } as CSSProperties}>
          <span>rendu</span>
          <i />
          <b>{preview}</b>
        </div>
      </div>
      <div className="technical-result">
        <strong>{delta}</strong>
        <small>{scale}</small>
      </div>
    </article>
  );
}

export function MetricsPanel({ result, sourceAnalysis }: MetricsPanelProps) {
  const sourceMetrics = sourceAnalysis?.metrics ?? result?.beforeMetrics ?? null;
  const isYoutubeMix = result?.settings.autoIntensity === "youtube";
  const isImpact = result?.settings.autoIntensity === "impact" || result?.settings.presetId === "power";

  return (
    <section className="panel metrics-panel">
      <div className="panel-heading compact-heading technical-heading">
        <div>
          <p className="eyebrow">Détails techniques</p>
          <h2>Mesures avant / après</h2>
        </div>
        {result && <span className="status-pill">Mesures estimées</span>}
      </div>

      {!sourceMetrics && !result && (
        <div className="empty-state small-empty-state">
          <p>Aucune mesure disponible.</p>
          <span>Les mesures apparaîtront ici après analyse locale.</span>
        </div>
      )}

      {sourceMetrics && !result && (
        <>
          <div className="source-measure-strip">
            <div>
              <span>LUFS source</span>
              <strong>{formatLufs(sourceMetrics.estimatedLufs)}</strong>
            </div>
            <div>
              <span>Peak source</span>
              <strong>{formatDb(sourceMetrics.peakDb)}</strong>
            </div>
            <div>
              <span>Brillance IA</span>
              <strong>{formatRatio(sourceMetrics.fizzRatio)}</strong>
            </div>
          </div>
          <p className="message message-info">
            Analyse source terminée. Génère une rendu pour afficher le comparatif graphique avant / après.
          </p>
        </>
      )}

      {result && (
        <>
          <div className="technical-summary-card">
            <div>
              <span>Résumé à l'écoute</span>
              <strong>{buildListeningSummary(result)}</strong>
            </div>
            <p><b>Champagne</b> Original · <b>Vert</b> rendu · Échelles fixes par mesure</p>
          </div>

          <div className="technical-list">
            <ComparisonRow
              label="Niveau perçu"
              original={formatLufs(result.beforeMetrics.estimatedLufs)}
              preview={formatLufs(result.afterMetrics.estimatedLufs)}
              delta={formatDelta(result.afterMetrics.estimatedLufs - result.beforeMetrics.estimatedLufs, " LUFS")}
              listening={loudnessListeningLabel(result.beforeMetrics.estimatedLufs, result.afterMetrics.estimatedLufs)}
              originalScore={normalizeLufs(result.beforeMetrics.estimatedLufs)}
              previewScore={normalizeLufs(result.afterMetrics.estimatedLufs)}
              scale="-18 à -12 LUFS"
            />
            <ComparisonRow
              label="Peak global"
              original={formatDb(result.beforeMetrics.peakDb)}
              preview={formatDb(result.afterMetrics.peakDb)}
              delta={formatDelta(result.afterMetrics.peakDb - result.beforeMetrics.peakDb, " dB")}
              listening={peakListeningLabel(result.beforeMetrics.peakDb, result.afterMetrics.peakDb)}
              originalScore={normalizePeak(result.beforeMetrics.peakDb)}
              previewScore={normalizePeak(result.afterMetrics.peakDb)}
              scale="-12 à 0 dBFS"
            />
            <ComparisonRow
              label="Brillance IA / fizz"
              original={formatRatio(result.beforeMetrics.fizzRatio)}
              preview={formatRatio(result.afterMetrics.fizzRatio)}
              delta={formatBrightnessDelta(result.beforeMetrics.fizzRatio, result.afterMetrics.fizzRatio)}
              listening={brightnessListeningLabel(result.beforeMetrics.fizzRatio, result.afterMetrics.fizzRatio)}
              originalScore={normalizePercent(result.beforeMetrics.fizzRatio)}
              previewScore={normalizePercent(result.afterMetrics.fizzRatio)}
              scale="0 à 4 % fizz"
            />
            <ComparisonRow
              label="Dynamique / respiration"
              original={formatDb(result.beforeMetrics.crestFactorDb)}
              preview={formatDb(result.afterMetrics.crestFactorDb)}
              delta={result.afterMetrics.crestFactorDb < result.beforeMetrics.crestFactorDb ? "Plus dense" : "Préservée"}
              listening={dynamicsListeningLabel(result.beforeMetrics.crestFactorDb, result.afterMetrics.crestFactorDb)}
              originalScore={normalizeCrest(result.beforeMetrics.crestFactorDb, isYoutubeMix, isImpact)}
              previewScore={normalizeCrest(result.afterMetrics.crestFactorDb, isYoutubeMix, isImpact)}
              scale={isYoutubeMix ? "10 à 22 dB" : isImpact ? "7 à 15 dB" : "7 à 17 dB"}
            />
            {result.settings.bassPunch && (
              <ComparisonRow
                label="Basses punchy"
                original={formatBassPunchRatio(result.report.bassPunch.beforeRatio)}
                preview={formatBassPunchRatio(result.report.bassPunch.afterRatio)}
                delta={formatBassPunchPercent(result.report.bassPunch.changePercent)}
                listening={result.report.bassPunch.safeMode ? "Dose réduite, grave déjà dense" : "Kick renforcé, bas contrôlé"}
                originalScore={normalizeBassPunchRatio(result.report.bassPunch.beforeRatio)}
                previewScore={normalizeBassPunchRatio(result.report.bassPunch.afterRatio)}
                scale="0 à 60 % utiles"
              />
            )}
            <ComparisonRow
              label="Espace stéréo"
              original={formatStereoRatio(result.report.stereoImage.beforeRatio)}
              preview={formatStereoRatio(result.report.stereoImage.afterRatio)}
              delta={result.settings.stereoSpace ? formatStereoPercent(result.report.stereoImage.changePercent) : "Option off"}
              listening={stereoListeningLabel(result)}
              originalScore={normalizeStereoRatio(result.report.stereoImage.beforeRatio)}
              previewScore={normalizeStereoRatio(result.report.stereoImage.afterRatio)}
              scale="0.25 à 0.60"
            />
          </div>

          <div className="technical-chip-row visual-metric-chips">
            <span>Rendu local : {(result.renderTimeMs / 1000).toFixed(2)} s</span>
            <span>Gain obtenu : {formatDelta(result.report.loudness.gainAppliedDb, " dB")}</span>
            <span>Marge peak finale : {(result.report.loudness.headroomSummary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb).toFixed(1)} dB</span>
            <span>Marge peak active : {result.report.loudness.headroomSummary ? result.report.loudness.headroomSummary.activeAverageHeadroomDb.toFixed(1) : "-"} dB moy.</span>
          </div>

          <p className="technical-note">
            Mesures indicatives. La différence de brillance est relative à l'origine et la validation finale reste l'écoute.
          </p>
        </>
      )}
    </section>
  );
}

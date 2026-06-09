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
  return clampPercent(((value + 24) / 16) * 100);
}

function normalizePeak(value: number): number {
  return clampPercent(((value + 12) / 12) * 100);
}

function normalizePercent(value: number): number {
  return clampPercent(value * 2600);
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

function ComparisonRow({
  label,
  original,
  preview,
  delta,
  originalScore,
  previewScore
}: {
  label: string;
  original: string;
  preview: string;
  delta: string;
  originalScore: number;
  previewScore: number;
}) {
  return (
    <article className="before-after-row">
      <div className="before-after-label">
        <strong>{label}</strong>
        <span>{delta}</span>
      </div>
      <div className="before-after-bars">
        <div className="before-after-bar original" style={{ "--value": `${originalScore}%` } as CSSProperties}>
          <span>Original</span>
          <i />
          <b>{original}</b>
        </div>
        <div className="before-after-bar preview" style={{ "--value": `${previewScore}%` } as CSSProperties}>
          <span>Preview</span>
          <i />
          <b>{preview}</b>
        </div>
      </div>
    </article>
  );
}

export function MetricsPanel({ result, sourceAnalysis }: MetricsPanelProps) {
  const sourceMetrics = sourceAnalysis?.metrics ?? result?.beforeMetrics ?? null;
  const isYoutubeMix = result?.settings.autoIntensity === "youtube" || result?.settings.presetId === "youtube";
  const isImpact = result?.settings.autoIntensity === "impact" || result?.settings.presetId === "power";

  return (
    <section className="panel metrics-panel visual-before-after-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Avant / Après</p>
          <h2>Ce que la Preview a changé</h2>
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
              <span>Fizz 9-16 kHz</span>
              <strong>{formatRatio(sourceMetrics.fizzRatio)}</strong>
            </div>
          </div>
          <p className="message message-info">
            Analyse source terminée. Génère une Preview pour afficher le comparatif graphique avant / après.
          </p>
        </>
      )}

      {result && (
        <>
          <div className="before-after-list">
            <ComparisonRow
              label="Niveau perçu"
              original={formatLufs(result.beforeMetrics.estimatedLufs)}
              preview={formatLufs(result.afterMetrics.estimatedLufs)}
              delta={formatDelta(result.afterMetrics.estimatedLufs - result.beforeMetrics.estimatedLufs, " LUFS")}
              originalScore={normalizeLufs(result.beforeMetrics.estimatedLufs)}
              previewScore={normalizeLufs(result.afterMetrics.estimatedLufs)}
            />
            <ComparisonRow
              label="Peak global"
              original={formatDb(result.beforeMetrics.peakDb)}
              preview={formatDb(result.afterMetrics.peakDb)}
              delta={formatDelta(result.afterMetrics.peakDb - result.beforeMetrics.peakDb, " dB")}
              originalScore={normalizePeak(result.beforeMetrics.peakDb)}
              previewScore={normalizePeak(result.afterMetrics.peakDb)}
            />
            <ComparisonRow
              label="Aigus IA / fizz"
              original={formatRatio(result.beforeMetrics.fizzRatio)}
              preview={formatRatio(result.afterMetrics.fizzRatio)}
              delta={`${formatRatio(Math.max(0, result.beforeMetrics.fizzRatio - result.afterMetrics.fizzRatio))} retiré`}
              originalScore={normalizePercent(result.beforeMetrics.fizzRatio)}
              previewScore={normalizePercent(result.afterMetrics.fizzRatio)}
            />
            <ComparisonRow
              label="Dynamique / respiration"
              original={formatDb(result.beforeMetrics.crestFactorDb)}
              preview={formatDb(result.afterMetrics.crestFactorDb)}
              delta={result.afterMetrics.crestFactorDb < result.beforeMetrics.crestFactorDb ? "Plus dense" : "Préservée"}
              originalScore={normalizeCrest(result.beforeMetrics.crestFactorDb, isYoutubeMix, isImpact)}
              previewScore={normalizeCrest(result.afterMetrics.crestFactorDb, isYoutubeMix, isImpact)}
            />
          </div>

          <div className="visual-chip-row visual-metric-chips">
            <span>Rendu local : {(result.renderTimeMs / 1000).toFixed(2)} s</span>
            <span>Gain obtenu : {formatDelta(result.report.loudness.gainAppliedDb, " dB")}</span>
            <span>Headroom final : {(result.report.loudness.headroomSummary?.finalHeadroomDb ?? result.report.loudness.achievedHeadroomDb).toFixed(1)} dB</span>
            <span>Headroom actif : {result.report.loudness.headroomSummary ? result.report.loudness.headroomSummary.activeAverageHeadroomDb.toFixed(1) : "-"} dB moy.</span>
          </div>

          <p className="message message-info">
            Ces graphiques sont indicatifs. Ils servent à comprendre la Preview, sans remplacer une mesure LUFS officielle.
          </p>
        </>
      )}
    </section>
  );
}

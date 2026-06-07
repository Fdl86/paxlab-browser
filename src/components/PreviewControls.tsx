import type { ChangeEvent } from "react";
import { useState } from "react";
import { buildSettingsFromAnalysis, inferAutoMasterPlan } from "../audio/autoTarget";
import { PREVIEW_PRESETS, getPresetById, getSettingsForPreset, describeSourceRepair } from "../audio/previewPresets";
import type {
  AutoIntensityId,
  PreviewSettings,
  PreviewRenderResult,
  PreviewStatus,
  SourceRepairLevel,
  SourceAnalysisResult
} from "../audio/types";

interface PreviewControlsProps {
  settings: PreviewSettings;
  previewStatus: PreviewStatus;
  hasAudio: boolean;
  hasPreview: boolean;
  hasPendingChanges: boolean;
  previewRevision: number;
  previewRenderedAt: string | null;
  sourceAnalysis: SourceAnalysisResult | null;
  previewResult: PreviewRenderResult | null;
  errorMessage: string | null;
  onSettingsChange: (settings: PreviewSettings) => void;
  onRenderPreview: () => void;
}

type WorkMode = "simple" | "expert";

function repairHelp(level: SourceRepairLevel): string {
  if (level === "strong") {
    return "Fort : utile sur exports Suno agressifs, brillants ou proches du clipping.";
  }

  if (level === "light") {
    return "Léger : conserve davantage l’énergie quand la source est déjà propre.";
  }

  return "Normal : compromis recommandé pour la majorité des morceaux IA.";
}

function autoIntensityLabel(value: AutoIntensityId): string {
  if (value === "safe") {
    return "Prudent";
  }

  if (value === "impact") {
    return "Impact";
  }

  return "Équilibré";
}

export function PreviewControls({
  settings,
  previewStatus,
  hasAudio,
  hasPreview,
  hasPendingChanges,
  previewRevision,
  previewRenderedAt,
  sourceAnalysis,
  previewResult,
  errorMessage,
  onSettingsChange,
  onRenderPreview
}: PreviewControlsProps) {
  const [mode, setMode] = useState<WorkMode>("simple");
  const preset = getPresetById(settings.presetId);
  const isRendering = previewStatus === "rendering";
  const autoPlan = sourceAnalysis
    ? inferAutoMasterPlan(sourceAnalysis.metrics, {
        autoIntensity: settings.autoIntensity,
        antiFatigue: settings.antiFatigue
      })
    : null;

  function rebuildAutoSettings(partial: Partial<PreviewSettings>) {
    const nextBase = {
      ...settings,
      ...partial
    };

    if (!sourceAnalysis) {
      onSettingsChange(nextBase);
      return;
    }

    const rebuilt = buildSettingsFromAnalysis(sourceAnalysis.metrics, nextBase.presetId, {
      autoIntensity: nextBase.autoIntensity,
      antiFatigue: nextBase.antiFatigue
    });

    onSettingsChange({
      ...rebuilt,
      ...partial,
      presetId: nextBase.presetId,
      autoIntensity: nextBase.autoIntensity,
      antiFatigue: nextBase.antiFatigue
    });
  }

  function updateSettings(partial: Partial<PreviewSettings>) {
    onSettingsChange({
      ...settings,
      ...partial
    });
  }

  function handlePresetChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextPresetId = event.target.value as PreviewSettings["presetId"];
    const nextPresetSettings = getSettingsForPreset(nextPresetId);

    if (sourceAnalysis) {
      const rebuilt = buildSettingsFromAnalysis(sourceAnalysis.metrics, nextPresetId, {
        autoIntensity: nextPresetSettings.autoIntensity,
        antiFatigue: nextPresetSettings.antiFatigue
      });
      onSettingsChange(rebuilt);
      return;
    }

    onSettingsChange(nextPresetSettings);
  }

  return (
    <section className="panel controls-panel pro-controls-panel dynamic-controls-panel">
      <div className="panel-heading compact-heading">
        <div>
          <p className="eyebrow">Rendu local</p>
          <h2>Auto Engine V3.2</h2>
        </div>
        <div className="mode-toggle" aria-label="Mode de réglage">
          <button type="button" className={mode === "simple" ? "active" : ""} onClick={() => setMode("simple")}>Simple</button>
          <button type="button" className={mode === "expert" ? "active" : ""} onClick={() => setMode("expert")}>Expert</button>
        </div>
      </div>

      <div className="control-room-summary control-room-summary-v2 dynamic-summary">
        <div>
          <span>Plan auto</span>
          <strong>{autoPlan?.profileLabel ?? "Analyse"}</strong>
          <small>Objectif indicatif, ajusté par sécurité au rendu.</small>
        </div>
        <div>
          <span>{previewResult ? "Résultat LUFS" : "Objectif LUFS"}</span>
          <strong>{previewResult ? `${previewResult.afterMetrics.estimatedLufs.toFixed(1)}` : autoPlan ? `${autoPlan.targetLufsMinEstimate.toFixed(1)} à ${autoPlan.targetLufsMaxEstimate.toFixed(1)}` : `${settings.targetLufsEstimate.toFixed(1)}`}</strong>
          <small>{previewResult && autoPlan ? `Objectif ${autoPlan.targetLufsMinEstimate.toFixed(1)} à ${autoPlan.targetLufsMaxEstimate.toFixed(1)}` : "Plage prévue avant rendu"}</small>
        </div>
        <div>
          <span>{previewResult ? "Headroom obtenu" : "Headroom prévu"}</span>
          <strong>{previewResult ? `${(previewResult.report.loudness.headroomSummary?.finalHeadroomDb ?? previewResult.report.loudness.achievedHeadroomDb).toFixed(1)} dB` : autoPlan ? `${autoPlan.targetHeadroomMinDb.toFixed(1)} à ${autoPlan.targetHeadroomMaxDb.toFixed(1)} dB` : `${Math.abs(settings.maxPeakDb).toFixed(1)} dB`}</strong>
          <small>{previewResult && autoPlan ? `Plage ${autoPlan.targetHeadroomMinDb.toFixed(1)} à ${autoPlan.targetHeadroomMaxDb.toFixed(1)} dB` : "Plage dynamique selon source"}</small>
        </div>
        <div>
          <span>Anti-fatigue</span>
          <strong>{settings.antiFatigue ? "Activé" : "Off"}</strong>
          <small>{settings.antiFatigue ? "AI Shimmer Control actif" : "Désactivé"}</small>
        </div>
      </div>

      <div className="segmented-control-block">
        <span>Orientation automatique</span>
        <div className="segmented-control auto-intensity-control">
          {(["safe", "balanced", "impact"] as AutoIntensityId[]).map((value) => (
            <button
              key={value}
              type="button"
              className={settings.autoIntensity === value ? "active" : ""}
              onClick={() => rebuildAutoSettings({ autoIntensity: value })}
            >
              {autoIntensityLabel(value)}
            </button>
          ))}
        </div>
        <p className="control-help">
          Prudent garde plus de marge. Équilibré est le mode par défaut. Impact pousse plus fort si le fichier le permet.
        </p>
      </div>

      <label className={settings.antiFatigue ? "fatigue-toggle active" : "fatigue-toggle"}>
        <input
          type="checkbox"
          checked={settings.antiFatigue}
          onChange={(event) => rebuildAutoSettings({ antiFatigue: event.target.checked })}
        />
        <span>
          <strong>Aigus fatigants</strong>
          <small>AI Shimmer Control : calme le fizz, la brillance dure et les cymbales IA qui piquent.</small>
        </span>
      </label>

      <div className="control-group">
        <label htmlFor="preset">Profil de rendu</label>
        <select id="preset" value={settings.presetId} onChange={handlePresetChange}>
          {PREVIEW_PRESETS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="control-help">{preset.description}</p>
      </div>

      <div className="segmented-control-block">
        <span>Réparation source</span>
        <div className="segmented-control">
          {(["light", "normal", "strong"] as SourceRepairLevel[]).map((level) => (
            <button
              key={level}
              type="button"
              className={settings.sourceRepair === level ? "active" : ""}
              onClick={() => updateSettings({ sourceRepair: level })}
            >
              {level === "light" ? "Léger" : level === "strong" ? "Fort" : "Normal"}
            </button>
          ))}
        </div>
        <p className="control-help">{repairHelp(settings.sourceRepair)}</p>
      </div>

      <div className="slider-row primary-slider-row">
        <div>
          <label htmlFor="intensity">Intensité globale</label>
          <span>{settings.intensity} %</span>
        </div>
        <input
          id="intensity"
          type="range"
          min="24"
          max="96"
          step="1"
          value={settings.intensity}
          onChange={(event) => updateSettings({ intensity: Number(event.target.value) })}
        />
      </div>

      {mode === "expert" && (
        <div className="expert-controls">
          <div className="control-group">
            <label htmlFor="highTreatment">Brillance / anti-fizz</label>
            <select
              id="highTreatment"
              value={settings.highTreatment}
              onChange={(event) => updateSettings({ highTreatment: event.target.value as PreviewSettings["highTreatment"] })}
            >
              <option value="verySoft">Très douce</option>
              <option value="soft">Plus douce</option>
              <option value="neutral">Naturelle</option>
              <option value="open">Plus ouverte</option>
            </select>
          </div>

          <div className="slider-row">
            <div>
              <label htmlFor="stereoWidth">Largeur stéréo</label>
              <span>{settings.stereoWidth} %</span>
            </div>
            <input
              id="stereoWidth"
              type="range"
              min="85"
              max="112"
              step="1"
              value={settings.stereoWidth}
              onChange={(event) => updateSettings({ stereoWidth: Number(event.target.value) })}
            />
          </div>

          <div className="slider-row">
            <div>
              <label htmlFor="density">Densité harmonique</label>
              <span>{settings.density} %</span>
            </div>
            <input
              id="density"
              type="range"
              min="0"
              max="80"
              step="1"
              value={settings.density}
              onChange={(event) => updateSettings({ density: Number(event.target.value) })}
            />
          </div>

          <div className="slider-row">
            <div>
              <label htmlFor="targetLufs">Cible centrale LUFS estimée</label>
              <span>{settings.targetLufsEstimate.toFixed(1)} LUFS</span>
            </div>
            <input
              id="targetLufs"
              type="range"
              min="-15.2"
              max="-11.8"
              step="0.1"
              value={settings.targetLufsEstimate}
              onChange={(event) => {
                const target = Number(event.target.value);
                updateSettings({ targetLufsEstimate: target, targetRmsDb: target + 0.75 });
              }}
            />
          </div>

          <div className="slider-row">
            <div>
              <label htmlFor="maxPeakDb">Headroom final demandé</label>
              <span>{Math.abs(settings.maxPeakDb).toFixed(1)} dB</span>
            </div>
            <input
              id="maxPeakDb"
              type="range"
              min="-3.5"
              max="-0.8"
              step="0.1"
              value={settings.maxPeakDb}
              onChange={(event) => {
                const nextCeiling = Number(event.target.value);
                const currentHeadroom = Math.abs(settings.maxPeakDb);
                const nextHeadroom = Math.abs(nextCeiling);
                const headroomDelta = currentHeadroom - nextHeadroom;
                const nextTarget = Math.min(-11.6, Math.max(-15.5, settings.targetLufsEstimate + headroomDelta * 0.65));
                updateSettings({
                  maxPeakDb: nextCeiling,
                  targetLufsEstimate: nextTarget,
                  targetRmsDb: nextTarget + 0.75
                });
              }}
            />
          </div>
        </div>
      )}

      <button
        className="primary-button big-render-button"
        type="button"
        disabled={!hasAudio || isRendering}
        onClick={onRenderPreview}
      >
        {isRendering
          ? "Génération en cours..."
          : hasPreview
            ? "Appliquer et régénérer"
            : "Générer la Preview Master"}
      </button>

      {!hasAudio && <p className="message message-info">Importe un fichier audio pour activer la génération locale.</p>}
      {previewStatus === "rendering" && <p className="message message-info">Lecture arrêtée. Nouvelle Preview en cours.</p>}
      {hasPendingChanges && hasPreview && previewStatus !== "rendering" && (
        <p className="message message-warning">Réglages modifiés. La Preview Master #{previewRevision} reste l’ancienne version tant que tu ne régénères pas.</p>
      )}
      {mode === "expert" && (
        <p className="message message-info">Le slider headroom agit maintenant aussi sur la cible loudness : moins de headroom demandé = rendu plus poussé, plus de headroom = rendu plus prudent.</p>
      )}
      {previewStatus === "ready" && !hasPendingChanges && (
        <p className="message message-success">Preview Master #{previewRevision}{previewRenderedAt ? ` · ${previewRenderedAt}` : ""} prête pour A/B et export.</p>
      )}
      {previewStatus === "error" && errorMessage && <p className="message message-error">{errorMessage}</p>}
    </section>
  );
}

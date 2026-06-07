import type { PreviewPreset, PreviewSettings } from "./types";

export const PREVIEW_PRESETS: PreviewPreset[] = [
  {
    id: "auto",
    label: "Automatique",
    description:
      "Réglage prudent pour morceaux IA : aigus légèrement contrôlés, niveau homogène, impact modéré.",
    settings: {
      presetId: "auto",
      highTreatment: "soft",
      intensity: 62,
      targetRmsDb: -13,
      maxPeakDb: -1.2
    }
  },
  {
    id: "smooth",
    label: "Doux / anti-fatigue",
    description:
      "Atténue davantage les aigus agressifs et les zones fatigantes. Utile sur sorties Suno brillantes.",
    settings: {
      presetId: "smooth",
      highTreatment: "soft",
      intensity: 72,
      targetRmsDb: -13.5,
      maxPeakDb: -1.2
    }
  },
  {
    id: "balanced",
    label: "Équilibré",
    description:
      "Traitement plus neutre, garde l’énergie sans trop refermer le haut du spectre.",
    settings: {
      presetId: "balanced",
      highTreatment: "neutral",
      intensity: 56,
      targetRmsDb: -13,
      maxPeakDb: -1.2
    }
  },
  {
    id: "open",
    label: "Plus ouvert",
    description:
      "Préserve plus d’air et de présence. À utiliser sur fichiers déjà propres ou trop sombres.",
    settings: {
      presetId: "open",
      highTreatment: "open",
      intensity: 45,
      targetRmsDb: -13,
      maxPeakDb: -1.2
    }
  }
];

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  ...PREVIEW_PRESETS[0].settings
};

export function getPresetById(presetId: PreviewSettings["presetId"]): PreviewPreset {
  return PREVIEW_PRESETS.find((preset) => preset.id === presetId) ?? PREVIEW_PRESETS[0];
}

export function getSettingsForPreset(presetId: PreviewSettings["presetId"]): PreviewSettings {
  return {
    ...getPresetById(presetId).settings
  };
}

export function describeHighTreatment(value: PreviewSettings["highTreatment"]): string {
  if (value === "soft") {
    return "Aigus adoucis";
  }

  if (value === "open") {
    return "Aigus plus ouverts";
  }

  return "Aigus neutres";
}

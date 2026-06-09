import type { HighTreatmentId, PreviewPreset, PreviewPresetId, PreviewSettings } from "./types";

export const PREVIEW_PRESETS: PreviewPreset[] = [
  {
    id: "auto",
    label: "Automatique V0.6",
    description:
      "Chaîne prudente pour morceaux IA : anti-fizz, niveau cible estimé, compression douce, sécurité peak.",
    settings: {
      presetId: "auto",
      highTreatment: "soft",
      intensity: 66,
      targetRmsDb: -13,
      targetLufsEstimate: -13,
      maxPeakDb: -1.2,
      stereoWidth: 100,
      density: 44,
      sourceRepair: "normal",
      autoIntensity: "balanced",
      antiFatigue: false,
      spacePreserve: false
    }
  },
  {
    id: "smooth",
    label: "Doux / anti-fatigue",
    description:
      "Calme davantage les aigus agressifs. À tester sur les exports Suno brillants ou fatigants au casque.",
    settings: {
      presetId: "smooth",
      highTreatment: "verySoft",
      intensity: 76,
      targetRmsDb: -13.5,
      targetLufsEstimate: -13.5,
      maxPeakDb: -1.2,
      stereoWidth: 98,
      density: 36,
      sourceRepair: "strong",
      autoIntensity: "safe",
      antiFatigue: true,
      spacePreserve: false
    }
  },
  {
    id: "balanced",
    label: "Équilibré",
    description:
      "Traitement moins marqué, utile quand le morceau est déjà propre et qu’on veut surtout comparer.",
    settings: {
      presetId: "balanced",
      highTreatment: "neutral",
      intensity: 52,
      targetRmsDb: -13,
      targetLufsEstimate: -13,
      maxPeakDb: -1.1,
      stereoWidth: 100,
      density: 30,
      sourceRepair: "light",
      autoIntensity: "balanced",
      antiFatigue: false,
      spacePreserve: false
    }
  },
  {
    id: "power",
    label: "Power / impact",
    description:
      "Garde plus d’impact dans le bas et densifie légèrement. À valider à l’écoute, pas un master final.",
    settings: {
      presetId: "power",
      highTreatment: "soft",
      intensity: 61,
      targetRmsDb: -13,
      targetLufsEstimate: -13,
      maxPeakDb: -1,
      stereoWidth: 102,
      density: 52,
      sourceRepair: "normal",
      autoIntensity: "impact",
      antiFatigue: false,
      spacePreserve: false
    }
  },

  {
    id: "youtube",
    label: "Mix YouTube",
    description:
      "Preset spécialisé pour upload vidéo : -14 LUFS intégré max estimé, peak plus prudent, grave stabilisé et aigus IA contrôlés.",
    settings: {
      presetId: "youtube",
      highTreatment: "soft",
      intensity: 58,
      targetRmsDb: -14.1,
      targetLufsEstimate: -14.1,
      maxPeakDb: -1.8,
      stereoWidth: 100,
      density: 34,
      sourceRepair: "normal",
      autoIntensity: "youtube",
      antiFatigue: false,
      spacePreserve: true
    }
  },
  {
    id: "open",
    label: "Plus ouvert",
    description:
      "Ouvre légèrement le haut. À utiliser seulement si le morceau semble trop étouffé après traitement.",
    settings: {
      presetId: "open",
      highTreatment: "open",
      intensity: 44,
      targetRmsDb: -13,
      targetLufsEstimate: -13,
      maxPeakDb: -1.1,
      stereoWidth: 104,
      density: 24,
      sourceRepair: "light",
      autoIntensity: "balanced",
      antiFatigue: false,
      spacePreserve: false
    }
  }
];

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  ...PREVIEW_PRESETS[0].settings
};

export function getPresetById(id: PreviewPresetId): PreviewPreset {
  return PREVIEW_PRESETS.find((preset) => preset.id === id) ?? PREVIEW_PRESETS[0];
}

export function getSettingsForPreset(id: PreviewPresetId): PreviewSettings {
  return {
    ...getPresetById(id).settings
  };
}

export function describeHighTreatment(id: HighTreatmentId): string {
  if (id === "verySoft") {
    return "Aigus très adoucis";
  }

  if (id === "soft") {
    return "Aigus adoucis";
  }

  if (id === "open") {
    return "Haut légèrement ouvert";
  }

  return "Aigus naturels";
}

export function describeSourceRepair(level: import("./types").SourceRepairLevel): string {
  if (level === "strong") {
    return "Réparation source forte";
  }

  if (level === "light") {
    return "Réparation source légère";
  }

  return "Réparation source normale";
}

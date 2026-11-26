using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public static class MasteringPresetCatalog
{
    public static MasteringSettings Auto { get; } = new(
        "auto",
        "Automatique V0.6",
        "Chaîne prudente pour morceaux IA : anti-fizz, niveau cible estimé, compression douce, sécurité peak.",
        "soft",
        66,
        -15.3,
        -12.2,
        -1.4,
        100,
        44,
        "normal",
        "balanced",
        false,
        false,
        false,
        false,
        false);

    public static MasteringSettings Smooth { get; } = new(
        "smooth",
        "Doux / anti-fatigue",
        "Calme davantage les aigus agressifs. À tester sur les exports Suno brillants ou fatigants au casque.",
        "verySoft",
        76,
        -16.4,
        -13.4,
        -2.4,
        98,
        36,
        "strong",
        "safe",
        true,
        false,
        false,
        false,
        false);

    public static MasteringSettings Natural { get; } = new(
        "balanced",
        "Traitement naturel",
        "Traitement stable et musical, utile quand le morceau est déjà propre et qu’on veut surtout comparer.",
        "neutral",
        52,
        -15.3,
        -12.2,
        -1.5,
        100,
        30,
        "light",
        "balanced",
        false,
        false,
        false,
        false,
        false);

    public static MasteringSettings Impact { get; } = new(
        "power",
        "Power / impact",
        "Garde plus d’impact dans le bas et densifie légèrement. À valider à l’écoute, pas un master final.",
        "soft",
        61,
        -14.4,
        -11.2,
        -1.2,
        102,
        52,
        "normal",
        "impact",
        false,
        false,
        false,
        false,
        false);

    public static MasteringSettings Youtube { get; } = new(
        "youtube",
        "Mix YouTube",
        "Preset spécialisé pour upload vidéo : LUFS intégré sous -14 avec clamp final, peak prudent, grave stabilisé et aigus IA contrôlés.",
        "soft",
        58,
        -17.8,
        -14.4,
        -1.8,
        100,
        34,
        "normal",
        "youtube",
        false,
        false,
        false,
        false,
        false);

    public static MasteringSettings Open { get; } = new(
        "open",
        "Plus ouvert",
        "Ouvre légèrement le haut. À utiliser seulement si le morceau semble trop étouffé après traitement.",
        "open",
        44,
        -15.6,
        -12.4,
        -1.6,
        104,
        24,
        "light",
        "balanced",
        false,
        false,
        false,
        false,
        false);

    public static IReadOnlyList<MasteringSettings> All { get; } = new[] { Auto, Smooth, Natural, Impact, Youtube, Open };

    public static MasteringSettings Get(string id)
    {
        string normalized = id.Equals("light", StringComparison.OrdinalIgnoreCase) ? "auto" : id;
        return All.FirstOrDefault(item => string.Equals(item.Id, normalized, StringComparison.OrdinalIgnoreCase)) ?? Auto;
    }

    public static MasteringSettings WithOptions(
        MasteringSettings source,
        bool antiFatigue,
        bool vocalPresence,
        bool stereoSpace,
        bool bassPunch,
        bool spacePreserve)
    {
        bool normalizedVocalPresence = antiFatigue || bassPunch ? false : vocalPresence;
        return source with
        {
            AntiFatigue = antiFatigue,
            VocalPresence = normalizedVocalPresence,
            StereoSpace = stereoSpace,
            BassPunch = bassPunch,
            SpacePreserve = spacePreserve
        };
    }
}

using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public static class AutoMasteringPlanner
{
    public static RecommendedPreviewPlan BuildRecommendedPreviewPlan(MasteringMetrics metrics)
    {
        bool brightOrFizz =
            metrics.HighTotalRatio > 0.38 ||
            metrics.FizzRatio > 0.065 ||
            metrics.BrightnessRatio > 0.22;
        bool clippedOrHot =
            metrics.ClippingSamples > 25 || metrics.ApproxTruePeakDb > -0.45;
        bool compact =
            metrics.CrestFactorDb < 7.6 || metrics.LoudnessRange < 4.5;
        bool lowLufsWithLimitedHeadroom =
            metrics.EstimatedLufs <= -16.2 &&
            metrics.ApproxTruePeakDb > -8.5 &&
            metrics.CrestFactorDb >= 8.2 &&
            metrics.LoudnessRange >= 4.2 &&
            !brightOrFizz &&
            !clippedOrHot;
        bool quietAndDynamic =
            metrics.EstimatedLufs <= -17.5 &&
            metrics.CrestFactorDb >= 8.8 &&
            metrics.LoudnessRange >= 4.8 &&
            !brightOrFizz &&
            !clippedOrHot;
        bool alreadySmooth =
            metrics.HighTotalRatio < 0.29 &&
            metrics.FizzRatio < 0.045 &&
            metrics.EstimatedLufs <= -13.8 &&
            !compact;

        string autoIntensity = "youtube";
        bool antiFatigue = brightOrFizz;
        string label = "Mix YouTube";
        string reason = "Sortie vidéo conseillée : niveau stabilisé, peak prudent et aigus IA contrôlés.";

        if (lowLufsWithLimitedHeadroom || quietAndDynamic)
        {
            autoIntensity = "impact";
            antiFatigue = false;
            label = "Impact";
            reason = lowLufsWithLimitedHeadroom
                ? "Niveau perçu bas avec des crêtes déjà présentes : PAXLAB conseille un rendu Power plus dense."
                : "Source basse et assez dynamique : PAXLAB conseille plus de densité avant validation A/B.";
        }
        else if (alreadySmooth)
        {
            autoIntensity = "balanced";
            antiFatigue = false;
            label = "Traitement naturel";
            reason = "Source déjà plutôt saine : traitement naturel conseillé, sans assombrir inutilement.";
        }
        else if (brightOrFizz)
        {
            autoIntensity = "youtube";
            antiFatigue = true;
            label = "Mix YouTube + Lissage brillance IA";
            reason = "Brillance IA ou fizz détecté : PAXLAB conseille le lissage des aigus pour une écoute plus confortable.";
        }
        else if (clippedOrHot || compact)
        {
            autoIntensity = "youtube";
            antiFatigue = false;
            label = "Mix YouTube";
            reason = "Source dense ou proche du plafond : rendu YouTube prudent conseillé avant export.";
        }

        string recommendedPresetId = autoIntensity == "youtube" ? "youtube" : autoIntensity == "impact" ? "power" : "auto";
        MasteringSettings settings = BuildSettingsFromAnalysis(
            metrics,
            recommendedPresetId,
            autoIntensity,
            antiFatigue,
            vocalPresence: false,
            stereoSpace: false,
            bassPunch: false,
            spacePreserve: false);

        return new RecommendedPreviewPlan(settings, autoIntensity, antiFatigue, label, reason);
    }

    public static AutoMasterPlan InferAutoMasterPlan(
        MasteringMetrics metrics,
        string autoIntensity = "balanced",
        bool antiFatigue = false,
        bool spacePreserve = false)
    {
        SafetyFlags flags = InferSafety(metrics, antiFatigue);
        bool ultraQuiet = metrics.EstimatedLufs <= -22;
        bool veryQuiet = metrics.EstimatedLufs <= -18;
        bool quiet = metrics.EstimatedLufs <= -15.5;
        bool moderate = metrics.EstimatedLufs <= -13.2;
        bool alreadyLoud = metrics.EstimatedLufs > -11.3;
        CeilingPlan ceilingPlan = InferCeiling(metrics, autoIntensity, antiFatigue);

        double targetLufsEstimate = -13.1;
        string profile = "balancedLift";
        string profileLabel = "Auto équilibré";
        string compressionIntent = "modéré";
        string safetyIntent = "normal";
        string reason = "Niveau source moyen : montée de niveau contrôlée, puis headroom dynamique selon sécurité.";

        if (autoIntensity == "youtube")
        {
            targetLufsEstimate = flags.Clipped || flags.VeryCompact || flags.FatiguingHigh ? -14.6 : flags.Compact ? -14.5 : -14.4;
            profile = "youtubeMix";
            profileLabel = "Mix YouTube";
            compressionIntent = flags.Compact || flags.VeryCompact ? "léger" : "modéré";
            safetyIntent = flags.Clipped || flags.FatiguingHigh ? "prudent" : "normal";
            reason = "Preset YouTube : PAXLAB vise un LUFS intégré sous -14 avec clamp final, un peak plus prudent, un grave stabilisé et des aigus IA contrôlés pour l’upload vidéo.";
        }
        else if (flags.Clipped)
        {
            targetLufsEstimate = -13.6;
            profile = "protect";
            profileLabel = "Auto protecteur";
            compressionIntent = "léger";
            safetyIntent = "protecteur";
            reason = "Pics déjà proches du plafond : PAXLAB privilégie la réparation et garde plus de marge.";
        }
        else if (alreadyLoud && flags.VeryCompact)
        {
            targetLufsEstimate = -12.8;
            profile = "preserve";
            profileLabel = "Auto préservation";
            compressionIntent = "préserver";
            safetyIntent = "prudent";
            reason = "Source déjà forte et compacte : le traitement évite de pousser inutilement.";
        }
        else if (alreadyLoud)
        {
            targetLufsEstimate = flags.FatiguingHigh ? -13.0 : -12.4;
            profile = "preserve";
            profileLabel = "Auto prudent";
            compressionIntent = "léger";
            safetyIntent = "prudent";
            reason = "Source déjà assez forte : mise en forme et sécurité, sans course au volume.";
        }
        else if (ultraQuiet && !flags.Compact)
        {
            targetLufsEstimate = flags.FatiguingHigh ? -12.1 : -11.5;
            profile = "strongLift";
            profileLabel = "Auto lift très fort";
            compressionIntent = "fort prudent";
            reason = "Source très basse : PAXLAB peut pousser franchement, avec contrôle de headroom.";
        }
        else if (ultraQuiet)
        {
            targetLufsEstimate = flags.FatiguingHigh ? -12.7 : -12.1;
            profile = "strongLift";
            profileLabel = "Auto lift fort contrôlé";
            compressionIntent = flags.Compact ? "modéré" : "fort prudent";
            reason = "Source très basse mais compacte : gain important, avec marge plus prudente.";
        }
        else if (veryQuiet && !flags.Compact)
        {
            targetLufsEstimate = flags.FatiguingHigh ? -12.1 : -11.6;
            profile = "strongLift";
            profileLabel = "Auto lift fort";
            compressionIntent = "fort prudent";
            reason = "Source basse et dynamique : rapprochement d’une rendu plus dense.";
        }
        else if (veryQuiet)
        {
            targetLufsEstimate = flags.FatiguingHigh ? -12.5 : -12.0;
            profile = "strongLift";
            profileLabel = "Auto lift contrôlé";
            compressionIntent = flags.Compact ? "modéré" : "fort prudent";
            reason = "Source basse mais déjà dense : lift contrôlé pour préserver l’écoute.";
        }
        else if (quiet)
        {
            targetLufsEstimate = flags.FatiguingHigh ? -12.4 : -12.0;
            profile = "strongLift";
            profileLabel = "Auto lift";
            compressionIntent = flags.Compact ? "modéré" : "fort prudent";
            reason = "Source sous le niveau cible : montée automatique et marge contrôlée.";
        }
        else if (moderate)
        {
            targetLufsEstimate = flags.FatiguingHigh ? -12.6 : -12.2;
            profile = "balancedLift";
            profileLabel = "Auto équilibré";
            compressionIntent = flags.Compact ? "léger" : "modéré";
            reason = "Source intermédiaire : densité supplémentaire sans forcer le plafond.";
        }

        if (autoIntensity == "youtube")
        {
            if (antiFatigue)
            {
                targetLufsEstimate -= 0.25;
                reason += " Lissage brillance IA actif : le preset YouTube garde un rendu encore plus confortable.";
            }
        }
        else
        {
            targetLufsEstimate += IntensityTargetShift(autoIntensity, antiFatigue);
        }

        if (spacePreserve && autoIntensity != "youtube")
        {
            targetLufsEstimate -= autoIntensity == "impact" ? 0.45 : 0.35;
            compressionIntent = compressionIntent == "fort prudent" ? "modéré" : compressionIntent == "modéré" ? "léger" : compressionIntent;
            reason += " Préserver l’espace actif : PAXLAB garde plus de respiration et limite moins fort.";
        }

        if (autoIntensity == "impact" && flags.VeryCompact && !veryQuiet)
        {
            targetLufsEstimate = Math.Min(targetLufsEstimate, -11.2);
        }

        if (autoIntensity == "youtube")
        {
            profileLabel = antiFatigue ? "Mix YouTube anti-fatigue" : "Mix YouTube";
        }
        else if (autoIntensity == "safe")
        {
            profileLabel += " prudent";
        }
        else if (autoIntensity == "impact")
        {
            profileLabel += " impact";
        }

        if (antiFatigue && autoIntensity != "youtube")
        {
            profileLabel += " anti-fatigue";
            reason += " Option Lissage brillance IA active : le haut du spectre est calmé et la cible reste plus confortable.";
        }

        targetLufsEstimate = autoIntensity == "youtube"
            ? Clamp(targetLufsEstimate, -15.4, -14.4)
            : Clamp(
                targetLufsEstimate,
                autoIntensity == "safe" || antiFatigue ? -15.2 : -14.4,
                autoIntensity == "impact" && !antiFatigue ? -10.4 : autoIntensity == "safe" || antiFatigue ? -12.9 : -11.4);

        double targetRmsDb = TargetLufsToRmsTarget(metrics, targetLufsEstimate);
        double lufsToleranceLow = autoIntensity == "youtube" ? 0.55 : autoIntensity == "safe" ? 0.9 : antiFatigue ? 1.0 : 0.75;
        double lufsToleranceHigh = autoIntensity == "youtube" ? Math.Max(0.1, -14.0 - targetLufsEstimate) : autoIntensity == "impact" ? 0.5 : 0.4;

        return new AutoMasterPlan(
            profile,
            profileLabel,
            OneDecimal(targetLufsEstimate),
            OneDecimal(targetLufsEstimate - lufsToleranceLow),
            OneDecimal(targetLufsEstimate + lufsToleranceHigh),
            OneDecimal(targetRmsDb),
            OneDecimal(ceilingPlan.Ceiling),
            OneDecimal(Math.Abs(ceilingPlan.Ceiling)),
            OneDecimal(ceilingPlan.MinHeadroom),
            OneDecimal(ceilingPlan.MaxHeadroom),
            OneDecimal(Clamp(targetLufsEstimate - metrics.EstimatedLufs, -2.2, 10.2)),
            compressionIntent,
            safetyIntent,
            reason);
    }

    public static MasteringSettings BuildSettingsFromAnalysis(
        MasteringMetrics metrics,
        string presetId = "auto",
        string? autoIntensity = null,
        bool? antiFatigue = null,
        bool? vocalPresence = null,
        bool? stereoSpace = null,
        bool? bassPunch = null,
        bool? spacePreserve = null)
    {
        MasteringSettings baseSettings = MasteringPresetCatalog.Get(presetId);
        string resolvedIntensity = autoIntensity ?? baseSettings.AutoIntensity;
        bool resolvedAntiFatigue = antiFatigue ?? baseSettings.AntiFatigue;
        bool resolvedBassPunch = bassPunch ?? baseSettings.BassPunch;
        bool resolvedVocalPresence = resolvedAntiFatigue || resolvedBassPunch ? false : vocalPresence ?? baseSettings.VocalPresence;
        bool resolvedStereoSpace = stereoSpace ?? baseSettings.StereoSpace;
        bool resolvedSpacePreserve = spacePreserve ?? baseSettings.SpacePreserve;
        AutoMasterPlan plan = InferAutoMasterPlan(metrics, resolvedIntensity, resolvedAntiFatigue, resolvedSpacePreserve);

        bool isYoutubeMix = resolvedIntensity == "youtube";
        string highTreatment = isYoutubeMix
            ? resolvedAntiFatigue || metrics.FizzRatio > 0.065 || metrics.HighTotalRatio > 0.38
                ? "verySoft"
                : "soft"
            : resolvedAntiFatigue
                ? "verySoft"
                : metrics.FizzRatio > 0.075 || metrics.HighTotalRatio > 0.42
                    ? "verySoft"
                    : metrics.HighTotalRatio > 0.34
                        ? "soft"
                        : baseSettings.HighTreatment;

        double liftPush = Clamp(plan.ExpectedLiftDb, 0, 10.5);
        double intensity = Clamp(
            baseSettings.Intensity +
            liftPush * (resolvedIntensity == "impact" ? 4.0 : resolvedIntensity == "youtube" ? 2.7 : resolvedIntensity == "safe" ? 2.8 : 3.4) +
            (metrics.FizzRatio > 0.08 ? 8 : 0) +
            (metrics.HighTotalRatio > 0.4 ? 6 : 0) +
            (metrics.CrestFactorDb < 7 ? -5 : 0) +
            (resolvedAntiFatigue ? 8 : 0),
            32,
            resolvedIntensity == "impact" ? 98 : resolvedIntensity == "youtube" ? 86 : 92);

        double density = Clamp(
            baseSettings.Density +
            (metrics.CrestFactorDb > 11 ? 7 : 0) +
            (plan.Profile == "strongLift" ? 5 : 0) +
            (resolvedIntensity == "impact" ? 5 : 0) -
            (resolvedIntensity == "youtube" ? 8 : 0) -
            (resolvedIntensity == "safe" ? 6 : 0) -
            (resolvedAntiFatigue ? 5 : 0) -
            (resolvedSpacePreserve ? 9 : 0) -
            (metrics.CrestFactorDb < 7 ? 8 : 0),
            12,
            resolvedIntensity == "youtube" ? 48 : 66);

        double stereoWidth = Clamp(
            metrics.StereoCorrelation < 0.18 ? 96 : baseSettings.StereoWidth,
            90,
            resolvedIntensity == "youtube" ? 102 : resolvedAntiFatigue ? 102 : 108);

        return baseSettings with
        {
            HighTreatment = highTreatment,
            Intensity = JsRoundToInt(intensity),
            TargetRmsDb = plan.TargetRmsDb,
            TargetLufsEstimate = plan.TargetLufsEstimate,
            MaxPeakDb = plan.CeilingDb,
            StereoWidth = JsRoundToInt(stereoWidth),
            Density = JsRoundToInt(density),
            SourceRepair = isYoutubeMix && !resolvedAntiFatigue ? "normal" : InferSourceRepair(metrics, resolvedAntiFatigue),
            AutoIntensity = resolvedIntensity,
            AntiFatigue = resolvedAntiFatigue,
            VocalPresence = resolvedVocalPresence,
            StereoSpace = resolvedStereoSpace,
            BassPunch = resolvedBassPunch,
            SpacePreserve = resolvedSpacePreserve
        };
    }

    public static AdvisorResult BuildAdvisor(MasteringMetrics metrics, MasteringSettings currentSettings)
    {
        var moves = new List<AdvisorMove>();
        AutoMasterPlan plan = InferAutoMasterPlan(metrics, currentSettings.AutoIntensity, currentSettings.AntiFatigue, currentSettings.SpacePreserve);
        MasteringSettings recommended = BuildSettingsFromAnalysis(
            metrics,
            currentSettings.Id,
            currentSettings.AutoIntensity,
            currentSettings.AntiFatigue,
            currentSettings.VocalPresence,
            currentSettings.StereoSpace,
            bassPunch: null,
            spacePreserve: currentSettings.SpacePreserve);

        moves.Add(new AdvisorMove(
            "auto-plan",
            $"Objectif indicatif : {plan.ProfileLabel}",
            $"LUFS visé {plan.TargetLufsMinEstimate:0.0} à {plan.TargetLufsMaxEstimate:0.0}, headroom {plan.TargetHeadroomMinDb:0.0} à {plan.TargetHeadroomMaxDb:0.0} dB. Le résultat réel peut rester plus prudent si le peak ou la dynamique l’imposent.",
            "info"));

        if (metrics.HighTotalRatio > 0.38 || metrics.FizzRatio > 0.075)
        {
            moves.Add(new AdvisorMove(
                "shimmer",
                "Brillance IA à calmer",
                "AI shimmer / fizz détecté dans le haut du spectre. Réparation source renforcée recommandée.",
                "warning"));
            recommended = recommended with
            {
                HighTreatment = "verySoft",
                SourceRepair = "strong",
                AntiFatigue = true,
                VocalPresence = false,
                AutoIntensity = currentSettings.AutoIntensity == "impact" ? "balanced" : currentSettings.AutoIntensity,
                Intensity = Math.Max(recommended.Intensity, 72)
            };
        }

        if (metrics.LowRatio > 0.46 || metrics.SubRatio > 0.065)
        {
            moves.Add(new AdvisorMove(
                "mud",
                "Bas du spectre chargé",
                "Le grave ou bas-médium peut masquer la voix et provoquer une impression de mix épais.",
                "info"));
            recommended = recommended with
            {
                Id = recommended.Id == "open" ? "balanced" : recommended.Id
            };
        }

        if (metrics.ClippingSamples > 25 || metrics.ApproxTruePeakDb > -0.4)
        {
            moves.Add(new AdvisorMove(
                "clip",
                "Pics très proches du plafond",
                "Soft de-clip et limiteur de sécurité doivent rester prudents pour éviter les craquements.",
                "warning"));
            recommended = recommended with { SourceRepair = "strong", MaxPeakDb = -1.4 };
        }

        if (metrics.CrestFactorDb < 7 || metrics.LoudnessRange < 4.2)
        {
            moves.Add(new AdvisorMove(
                "dense",
                "Morceau déjà dense",
                "Cible de niveau plus prudente pour ne pas écraser davantage la dynamique.",
                "info"));
            recommended = recommended with
            {
                TargetLufsEstimate = Math.Min(recommended.TargetLufsEstimate, -13.8),
                TargetRmsDb = Math.Min(recommended.TargetRmsDb, -13.1),
                Density = Math.Min(recommended.Density, 38)
            };
        }

        if (metrics.StereoCorrelation < 0.18)
        {
            moves.Add(new AdvisorMove(
                "stereo",
                "Stéréo très large",
                "Réduction légère de largeur pour stabiliser le centre et limiter le flou.",
                "info"));
            recommended = recommended with { StereoWidth = Math.Min(recommended.StereoWidth, 96) };
        }

        if (moves.Count == 1)
        {
            moves.Add(new AdvisorMove(
                "clean",
                "Source plutôt saine",
                "Traitement léger conseillé : conserver la clarté et éviter de trop assombrir le morceau.",
                "success"));
            MasteringSettings balanced = MasteringPresetCatalog.Natural;
            recommended = balanced with
            {
                TargetLufsEstimate = recommended.TargetLufsEstimate,
                TargetRmsDb = recommended.TargetRmsDb,
                SourceRepair = "light",
                AutoIntensity = currentSettings.AutoIntensity,
                AntiFatigue = currentSettings.AntiFatigue,
                VocalPresence = currentSettings.VocalPresence,
                StereoSpace = currentSettings.StereoSpace,
                SpacePreserve = currentSettings.SpacePreserve
            };
        }

        string confidence = moves.Any(move => move.Severity == "warning") ? "forte" : "correcte";
        string summary = moves.Any(move => move.Id == "shimmer")
            ? "Recommandation : lift auto avec réparation forte et aigus très doux."
            : moves.Any(move => move.Id == "clean")
                ? "Recommandation : traitement léger, source déjà assez propre."
                : $"Recommandation : {plan.ProfileLabel.ToLowerInvariant()}, objectif indicatif {plan.TargetLufsMinEstimate:0.0} à {plan.TargetLufsMaxEstimate:0.0} LUFS est.";

        return new AdvisorResult(summary, moves, recommended, confidence);
    }

    public static double TargetLufsToRmsTarget(MasteringMetrics metrics, double targetLufs)
    {
        double lufsRmsDelta = Clamp(metrics.EstimatedLufs - metrics.RmsDb, -1.5, 5.8);
        double safetyBias = targetLufs <= -14 ? -0.15 : 0;
        return Clamp(targetLufs - lufsRmsDelta + safetyBias, -20.5, -9.2);
    }

    private static SafetyFlags InferSafety(MasteringMetrics metrics, bool antiFatigue)
    {
        bool clipped = metrics.ClippingSamples > 25 || metrics.ApproxTruePeakDb > -0.35;
        bool veryCompact = metrics.CrestFactorDb < 6.8 || metrics.LoudnessRange < 3.8;
        bool compact = metrics.CrestFactorDb < 7.8 || metrics.LoudnessRange < 4.6;
        bool fatiguingHigh = antiFatigue || metrics.HighTotalRatio > 0.4 || metrics.FizzRatio > 0.08;
        return new SafetyFlags(clipped, veryCompact, compact, fatiguingHigh);
    }

    private static CeilingPlan InferCeiling(MasteringMetrics metrics, string autoIntensity, bool antiFatigue)
    {
        SafetyFlags flags = InferSafety(metrics, antiFatigue);

        if (autoIntensity == "youtube")
        {
            if (flags.Clipped || flags.VeryCompact || flags.FatiguingHigh) return new CeilingPlan(-2.0, 1.8, 4.0);
            if (flags.Compact) return new CeilingPlan(-1.9, 1.6, 3.8);
            return new CeilingPlan(-1.8, 1.5, 3.5);
        }

        if (flags.Clipped) return new CeilingPlan(-2.4, 2.0, 4.0);
        if (antiFatigue && (flags.FatiguingHigh || flags.Compact)) return new CeilingPlan(-2.8, 2.4, 4.2);

        if (autoIntensity == "safe")
        {
            return flags.FatiguingHigh || flags.VeryCompact
                ? new CeilingPlan(-3.2, 2.8, 4.4)
                : new CeilingPlan(-2.8, 2.4, 4.0);
        }

        if (autoIntensity == "impact")
        {
            if (flags.FatiguingHigh || flags.VeryCompact) return new CeilingPlan(-1.8, 1.5, 3.2);
            return new CeilingPlan(-1.2, 1.0, 2.4);
        }

        if (flags.FatiguingHigh || flags.VeryCompact) return new CeilingPlan(-2.6, 2.0, 4.0);
        if (flags.Compact) return new CeilingPlan(-2.2, 1.8, 3.5);
        return new CeilingPlan(-1.8, 1.4, 3.2);
    }

    private static double IntensityTargetShift(string autoIntensity, bool antiFatigue)
    {
        if (autoIntensity == "youtube") return antiFatigue ? -1.15 : -0.95;
        double shift = autoIntensity == "safe" ? -1.0 : autoIntensity == "impact" ? 0.8 : -0.2;
        return shift + (antiFatigue ? -0.55 : 0);
    }

    private static string InferSourceRepair(MasteringMetrics metrics, bool antiFatigue)
    {
        bool harshOrFizz = antiFatigue || metrics.FizzRatio > 0.075 || metrics.HighTotalRatio > 0.4;
        bool clipped = metrics.ClippingSamples > 25 || metrics.ApproxTruePeakDb > -0.4;
        bool compact = metrics.CrestFactorDb < 7.3 || metrics.LoudnessRange < 4.5;
        if ((harshOrFizz && compact) || clipped || antiFatigue) return "strong";
        if (harshOrFizz || metrics.NoiseFloorEstimateDb > -50) return "normal";
        return "light";
    }

    private static double OneDecimal(double value) => Math.Round(value, 1, MidpointRounding.AwayFromZero);
    private static int JsRoundToInt(double value) => (int)Math.Floor(value + 0.5);
    private static double Clamp(double value, double min, double max) => Math.Max(min, Math.Min(max, value));

    private sealed record SafetyFlags(bool Clipped, bool VeryCompact, bool Compact, bool FatiguingHigh);
    private sealed record CeilingPlan(double Ceiling, double MinHeadroom, double MaxHeadroom);
}

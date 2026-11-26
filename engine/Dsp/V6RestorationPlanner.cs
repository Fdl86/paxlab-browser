using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public static class V6RestorationPlanner
{
    public static V6RestorationPlan Build(
        V6SourceMetrics metrics,
        MasteringMetrics commonMetrics,
        V6RestorationOptions options)
    {
        ArgumentNullException.ThrowIfNull(metrics);
        ArgumentNullException.ThrowIfNull(commonMetrics);
        ArgumentNullException.ThrowIfNull(options);

        double lowNeed = RampAbove(metrics.LowSideMidDbMedian, -6.4, -3.5);
        double lowSideReduction = Clamp(lowNeed * 0.8, 0, 0.8);

        double vocalWidthNeed = RampBelow(metrics.VocalSideMidDbMedian, -6.8, -9.8);
        double globalWidthNeed = RampBelow(metrics.GlobalSideMidDbMedian, -8.4, -11.2);
        double corrConfidence = RampAbove(metrics.CorrelationMedian, 0.72, 0.92);
        double widthNeed = Math.Min(vocalWidthNeed, 0.72 * vocalWidthNeed + 0.28 * globalWidthNeed) * corrConfidence;

        if (options.StereoSpaceIntent)
        {
            double requestedVocal = RampBelow(metrics.VocalSideMidDbMedian, -6.2, -9.2);
            double requestedGlobal = RampBelow(metrics.GlobalSideMidDbMedian, -7.8, -10.7);
            widthNeed = Math.Max(
                widthNeed,
                (0.72 * requestedVocal + 0.28 * requestedGlobal) * Math.Max(0.45, corrConfidence));
        }

        double stereoMain = Clamp(widthNeed * (options.StereoSpaceIntent ? 0.72 : 0.58), 0, 0.72);
        double stereoLow = Clamp(stereoMain * 0.28, 0, 0.20);
        double stereoUpper = Clamp(stereoMain * 0.24, 0, 0.18);
        if (stereoMain < 0.08)
        {
            stereoLow = 0;
            stereoMain = 0;
            stereoUpper = 0;
        }

        double boxNeed = RampAbove(metrics.BoxRelativeDbMedian, -8.20, -6.50);
        double boxReduction = Clamp(boxNeed * 0.95, 0, 0.95);
        if (boxReduction < 0.12) boxReduction = 0;

        double presenceDeficit = Math.Max(
            RampBelow(metrics.PresenceRelativeDbMedian, -9.5, -12.0),
            RampBelow(metrics.PresenceRelativeDbMedian - metrics.BoxRelativeDbMedian, -2.3, -4.3));
        double presenceExcess = RampAbove(metrics.PresenceRelativeDbMedian, -6.35, -4.9);
        double presenceCorrection = 0;
        if (presenceDeficit > 0 && metrics.SibilanceRelativeDbMedian < -13.2)
        {
            presenceCorrection = Clamp(presenceDeficit * 0.45, 0, 0.45);
        }
        else if (presenceExcess > 0)
        {
            presenceCorrection = -Clamp(presenceExcess * 0.32, 0, 0.32);
        }

        if (options.VocalPresenceIntent && presenceCorrection >= 0 && metrics.SibilanceRelativeDbMedian < -13.0)
        {
            double room = RampBelow(metrics.PresenceRelativeDbMedian, -7.4, -10.5);
            presenceCorrection = Clamp(presenceCorrection + room * 0.16, 0, 0.45);
        }

        double sibilanceNeed = RampAbove(metrics.SibilanceRelativeDbMedian, -16.70, -14.50);
        double brightnessEvidence = RampAbove(commonMetrics.BrightnessRatio, .048, .075) * .85;
        double relativeEvidence = RampAbove(metrics.SibilanceVsPresenceDbMedian, -7.80, -6.50) * .90;
        double sideEvidence = RampAbove(metrics.SibilanceSideMidDbMedian, -9.00, -7.00) * .65;
        double sibilanceConfidence = Math.Max(brightnessEvidence, Math.Max(relativeEvidence, sideEvidence));
        // A moderate relative excess alone is not sufficient to alter an otherwise healthy mix.
        // This corroboration gate remains continuous around the healthy-reference thresholds.
        double sibilanceCorroboration = Math.Max(
            RampAbove(commonMetrics.BrightnessRatio, .040, .048),
            Math.Max(
                RampAbove(metrics.SibilanceVsPresenceDbMedian, -7.10, -6.85),
                RampAbove(metrics.SibilanceSideMidDbMedian, -9.00, -8.00)));
        double sibilanceReduction = sibilanceConfidence < .10
            ? 0
            : Clamp(sibilanceNeed * (.20 + .95 * sibilanceConfidence) * sibilanceCorroboration, 0, 1.35);
        if (sibilanceReduction < .10) sibilanceReduction = 0;

        double fizzNeed = RampAbove(metrics.FizzRelativeDbMedian, -20.30, -18.00);
        double flatnessEvidence = RampAbove(metrics.FizzSpectralFlatnessMedian, .41, .52);
        double brightFizzEvidence =
            RampAbove(commonMetrics.BrightnessRatio, .055, .075) *
            RampAbove(metrics.FizzRelativeDbMedian, -19.00, -17.80);
        double textureEvidence = Math.Max(flatnessEvidence, brightFizzEvidence);
        double temporalPersistence = RampBelow(metrics.FizzTemporalCrestDb, 9.40, 7.40);
        double persistence = textureEvidence * (.65 + .35 * temporalPersistence);
        double hfReduction = persistence < .12
            ? 0
            : Clamp(fizzNeed * (.20 + .80 * persistence), 0, .85);
        if (hfReduction < .10) hfReduction = 0;
        // Apply the combined cap to the values actually returned by the plan.
        // Rounding each component separately can otherwise turn 1.055 + 0.595 dB
        // into 1.06 + 0.60 dB, exceeding the 1.65 dB safety limit.
        double roundedSibilanceReduction = Round2(sibilanceReduction);
        double roundedHfReduction = Math.Min(
            Round2(hfReduction),
            Round2(Math.Max(0, 1.65 - roundedSibilanceReduction)));

        return new V6RestorationPlan(
            Round2(lowSideReduction),
            Round2(stereoLow),
            Round2(stereoMain),
            Round2(stereoUpper),
            Round2(presenceCorrection),
            Round2(boxReduction),
            roundedSibilanceReduction,
            roundedHfReduction,
            boxReduction > 0,
            roundedSibilanceReduction > 0,
            roundedHfReduction > 0);
    }

    private static double RampAbove(double value, double start, double full)
    {
        if (value <= start) return 0;
        if (value >= full) return 1;
        return (value - start) / (full - start);
    }

    private static double RampBelow(double value, double start, double full)
    {
        if (value >= start) return 0;
        if (value <= full) return 1;
        return (start - value) / (start - full);
    }

    private static double Clamp(double value, double min, double max) => Math.Min(max, Math.Max(min, value));
    private static double Round2(double value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}

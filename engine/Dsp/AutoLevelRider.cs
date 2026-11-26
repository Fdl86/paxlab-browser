using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

// Gain-only preparation stage. This module is intentionally separate from the
// historical mastering engine and the Suno V6 spectral restoration.
public enum AutoLevelRiderMode { Off, Auto, Forced }
public enum AutoLevelRiderConfidence { None, Uncertain, Strong }

public sealed record AutoLevelRiderOptions(
    string Profile,
    double ReferenceStartSeconds,
    double ReferenceEndSeconds,
    double ToleranceDb,
    double MaxAttenuationDb,
    double AttackSeconds,
    double ReleaseSeconds,
    double Strength)
{
    public static AutoLevelRiderOptions ForProfile(string profile) => profile switch
    {
        "conservateur" => new(profile, 6, 26, 1.1, 4.0, 9.0, 22.0, .72),
        "correctif" => new(profile, 6, 26, .2, 8.0, 4.0, 18.0, 1.08),
        _ => new("equilibre", 6, 26, .6, 6.5, 5.0, 16.0, 1.0)
    };
}

public sealed record AutoLevelRiderPlan(
    AutoLevelRiderOptions Options,
    double DurationSeconds,
    double ReferenceLevelDb,
    string ReferenceExplanation,
    double[] SecondRmsDb,
    double[] TrendDb,
    double[] TargetGainDb,
    double[] GainDb,
    bool DriftDetected,
    AutoLevelRiderConfidence Confidence,
    string Explanation,
    double[] StructuralLevelsDb)
{
    public double MaximumReductionDb => GainDb.Length == 0 ? 0 : -GainDb.Min();
    public int FirstAttenuationSecond => Array.FindIndex(GainDb, x => x < -.02);
    public bool HasCorrection => MaximumReductionDb > .02;
}

public static class AutoLevelRider
{
    private const double GateDb = -40;

    public static AutoLevelRiderPlan BypassPlan(WaveAudioData audio, AutoLevelRiderOptions options) =>
        new(options, audio.Samples.Length / (double)(audio.SampleRate * audio.Channels),
            0, "Désactivé", [], [], [], [0], false,
            AutoLevelRiderConfidence.None, "Rider désactivé", []);

    // A whole second is used for each measurement, on the linked channel energy.
    // A final fractional second is preserved by extending the last gain sample.
    public static AutoLevelRiderPlan Analyze(WaveAudioData audio, AutoLevelRiderOptions options, bool force = false)
    {
        ArgumentNullException.ThrowIfNull(audio);
        ArgumentNullException.ThrowIfNull(options);
        if (audio.SampleRate <= 0 || audio.Channels is < 1 or > 2 || audio.Samples.Length % audio.Channels != 0)
            throw new ArgumentException("Signal mono/stéréo interleavé invalide.", nameof(audio));
        if (options.ReferenceStartSeconds < 0 || options.ReferenceEndSeconds <= options.ReferenceStartSeconds ||
            options.ToleranceDb is < 0 or > 10 || options.MaxAttenuationDb is <= 0 or > 12 ||
            options.AttackSeconds <= 0 || options.ReleaseSeconds <= 0 ||
            options.Strength is <= 0 or > 2)
            throw new ArgumentOutOfRangeException(nameof(options), "Paramètres Rider hors limites.");

        int frames = audio.Samples.Length / audio.Channels;
        double duration = frames / (double)audio.SampleRate;
        int n = frames / audio.SampleRate;
        var rms = new double[n];
        for (int second = 0; second < n; second++)
        {
            long offset = (long)second * audio.SampleRate * audio.Channels;
            long end = offset + (long)audio.SampleRate * audio.Channels;
            double energy = 0;
            for (long k = offset; k < end; k++)
            {
                double sample = audio.Samples[k];
                if (!double.IsFinite(sample)) throw new InvalidOperationException("Signal contenant un échantillon non fini.");
                energy += sample * sample;
            }
            rms[second] = 10 * Math.Log10(Math.Max(energy / (audio.SampleRate * (double)audio.Channels), 1e-20));
        }

        return AnalyzeFromRms(rms, duration, options, force);
    }

    // Safe to reuse for UI adjustments: avoids decoding and scanning tens of
    // millions of audio samples every time a slider moves.
    public static AutoLevelRiderPlan AnalyzeFromRms(
        double[] rms, double duration, AutoLevelRiderOptions options, bool force = false)
    {
        ArgumentNullException.ThrowIfNull(rms);
        ArgumentNullException.ThrowIfNull(options);
        if (options.ReferenceStartSeconds < 0 || options.ReferenceEndSeconds <= options.ReferenceStartSeconds ||
            options.ToleranceDb is < 0 or > 10 || options.MaxAttenuationDb is <= 0 or > 12 ||
            options.AttackSeconds <= 0 || options.ReleaseSeconds <= 0 ||
            options.Strength is <= 0 or > 2)
            throw new ArgumentOutOfRangeException(nameof(options), "Paramètres Rider hors limites.");
        int n = rms.Length;
        var gain = new double[n + 1];
        var target = new double[n];
        var trend = new double[n];
        double refDb = QuantileInRange(rms, options.ReferenceStartSeconds, options.ReferenceEndSeconds, .4) ?? -100;
        string refExplanation = "Référence initiale";
        if (n < 90) return NoCorrection(options, duration, rms, trend, target, gain, refDb, refExplanation,
            "Durée inférieure à 90 s : analyse des sections insuffisante.");
        if (options.ReferenceEndSeconds >= duration - 3) return NoCorrection(options, duration, rms, trend, target, gain, refDb, refExplanation,
            "Période de référence incompatible avec la durée.");

        double? fallback = QuantileInRange(rms, options.ReferenceEndSeconds,
            Math.Min(.42 * duration, Math.Min(options.ReferenceEndSeconds + 36, 75)), .4);
        if (refDb <= -99)
        {
            if (fallback is null) return NoCorrection(options, duration, rms, trend, target, gain, refDb, refExplanation,
                "Référence inactive : traitement non autorisé.");
            refDb = fallback.Value;
            refExplanation = "Référence après introduction silencieuse";
        }
        else if (fallback is not null && fallback.Value - refDb > 5.0)
        {
            refDb = fallback.Value;
            refExplanation = "Référence déplacée après introduction calme";
        }
        else
        {
            double mid = (options.ReferenceStartSeconds + options.ReferenceEndSeconds) * .5;
            double? a = QuantileInRange(rms, options.ReferenceStartSeconds, mid, .4);
            double? b = QuantileInRange(rms, mid, options.ReferenceEndSeconds, .4);
            if (a is not null && b is not null && b.Value - a.Value > 3.2)
            {
                refDb = b.Value;
                refExplanation = "Référence ajustée pour crescendo initial";
            }
        }

        double? b2 = QuantileInRange(rms, .28*n, .43*n, .4);
        double? b3 = QuantileInRange(rms, .50*n, .66*n, .4);
        double? b4 = QuantileInRange(rms, .76*n, .94*n, .4);
        if (b2 is null || b3 is null || b4 is null)
            return NoCorrection(options, duration, rms, trend, target, gain, refDb, refExplanation,
                "Sections insuffisamment actives.");
        double[] levels = [refDb, b2.Value, b3.Value, b4.Value];
        double[] differences = [levels[1]-levels[0], levels[2]-levels[1], levels[3]-levels[2]];
        int rises = differences.Count(x => x >= .55);
        bool detected = levels[3] - levels[0] >= 3.0 && rises >= 2 && differences.Min() >= -1.0 && levels[3] > levels[2] + .25;
        bool strong = detected && rises == 3 && levels[3]-levels[0] >= 3.3 && differences.Min() >= .45;
        var confidence = strong ? AutoLevelRiderConfidence.Strong : detected ? AutoLevelRiderConfidence.Uncertain : AutoLevelRiderConfidence.None;
        if (!detected && !force)
            return NoCorrection(options, duration, rms, trend, target, gain, refDb, refExplanation,
                "Aucune dérive progressive suffisamment fiable.", levels);

        double[] wide = QuantileCurve(rms, .35, 35, refDb);
        double[] medium = QuantileCurve(rms, .5, 21, refDb);
        double[] shortTerm = QuantileCurve(rms, .5, 13, refDb);
        for (int i=0;i<n;i++) trend[i] = .35*wide[i] + .45*medium[i] + .20*shortTerm[i];
        double[] smooth = SmoothReplicate(trend, 9);
        int protectedSeconds = Math.Min(n, (int)Math.Ceiling(options.ReferenceEndSeconds));
        for (int i=protectedSeconds;i<n;i++)
            target[i] = -Math.Min(options.MaxAttenuationDb,
                options.Strength * Math.Max(0, smooth[i] - refDb - options.ToleranceDb));
        double attackAlpha = 1-Math.Exp(-1/options.AttackSeconds);
        double releaseAlpha = 1-Math.Exp(-1/options.ReleaseSeconds);
        for (int i=0;i<n;i++)
        {
            double alpha = target[i] < gain[i] ? attackAlpha : releaseAlpha;
            gain[i+1] = Math.Clamp(gain[i] + alpha*(target[i]-gain[i]), -options.MaxAttenuationDb, 0);
        }
        return new AutoLevelRiderPlan(options, duration, refDb, refExplanation, rms, trend, target, gain,
            detected, confidence, detected ? "Dérive longue détectée" : "Correction forcée, dérive non confirmée", levels);
    }

    public static WaveAudioData Apply(WaveAudioData source, AutoLevelRiderPlan plan)
    {
        if (!plan.HasCorrection) return source;
        if (plan.GainDb.Length != source.Samples.Length / source.Channels / source.SampleRate + 1)
            throw new InvalidOperationException("Plan Rider obsolète pour ce signal.");
        float[] output = (float[])source.Samples.Clone();
        int frames = output.Length / source.Channels;
        double[] linear = plan.GainDb.Select(x => Math.Pow(10, Math.Clamp(x, -12, 0)/20)).ToArray();
        for (int frame=0;frame<frames;frame++)
        {
            int i = Math.Min(frame / source.SampleRate, linear.Length - 2);
            double fraction = Math.Min(1, (frame - (long)i * source.SampleRate) / (double)source.SampleRate);
            double g = linear[i] + fraction*(linear[i+1]-linear[i]);
            if (g >= 1) continue; // Exact sample preservation, outside correction.
            int offset=frame*source.Channels;
            for (int ch=0;ch<source.Channels;ch++) output[offset+ch] = (float)(output[offset+ch]*g);
        }
        return source with { Samples = output };
    }

    public static bool ShouldApply(AutoLevelRiderMode mode, AutoLevelRiderPlan plan) => mode switch
    {
        AutoLevelRiderMode.Forced => plan.HasCorrection,
        AutoLevelRiderMode.Auto => plan.Confidence == AutoLevelRiderConfidence.Strong && plan.HasCorrection,
        _ => false
    };

    private static AutoLevelRiderPlan NoCorrection(AutoLevelRiderOptions options, double duration,
        double[] rms, double[] trend, double[] target, double[] gains, double reference,
        string refDescription, string reason, double[]? bands = null) =>
        new(options, duration, reference, refDescription, rms, trend, target, gains,
            false, AutoLevelRiderConfidence.None, reason, bands ?? []);

    private static double? QuantileInRange(double[] values, double start, double end, double q)
    {
        int a = Math.Clamp((int)start, 0, values.Length);
        int b = Math.Clamp((int)end, 0, values.Length);
        var active = values.Skip(a).Take(Math.Max(0,b-a)).Where(x => x > GateDb).OrderBy(x => x).ToArray();
        return active.Length < 5 ? null : active[(int)Math.Floor((active.Length-1)*q)];
    }

    private static double[] QuantileCurve(double[] values, double quantile, int window, double fallback)
    {
        double previous = fallback;
        var output = new double[values.Length];
        for (int i=0;i<values.Length;i++)
        {
            var active = values.Skip(Math.Max(0, i-window/2))
                .Take(Math.Min(values.Length-1,i+window/2)-Math.Max(0,i-window/2)+1)
                .Where(x=>x > GateDb).OrderBy(x=>x).ToArray();
            if(active.Length >= 5) previous=active[(int)Math.Floor((active.Length-1)*quantile)];
            output[i] = previous;
        }
        return output;
    }

    private static double[] SmoothReplicate(double[] values, int window)
    {
        var output = new double[values.Length];
        int radius=window/2;
        for(int i=0;i<values.Length;i++)
        {
            double sum=0;
            for(int j=-radius;j<=radius;j++) sum+=values[Math.Clamp(i+j,0,values.Length-1)];
            output[i]=sum/window;
        }
        return output;
    }
}

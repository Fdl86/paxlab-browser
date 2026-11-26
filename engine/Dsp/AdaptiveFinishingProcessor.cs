using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

// Experimental opt-in finishing stage. The validated legacy mastering engines
// remain untouched; no changes are made when both options are disabled.
public enum SectionLevelMode { Off, Doux, Progressif }
public sealed record AdaptiveFinishingOptions(bool MasterB, SectionLevelMode SectionLevel)
{
    public bool Enabled => MasterB || SectionLevel != SectionLevelMode.Off;
}

public static class AdaptiveFinishingProcessor
{
    public static MasteringRenderResult Apply(MasteringRenderResult render, AdaptiveFinishingOptions options)
    {
        ArgumentNullException.ThrowIfNull(render);
        ArgumentNullException.ThrowIfNull(options);
        if (!options.Enabled) return render;

        // The Python RC1B reference operates on the rendered PAXLAB audio.
        // Keep the user's existing output target for non-YouTube presets.
        double target = render.Report.Settings.AutoIntensity == "youtube"
            ? -14.4 : render.After.EstimatedLufs;
        double ceiling = Math.Min(-1.5, render.Report.Settings.MaxPeakDb);
        WaveAudioData processed = ProcessAudio(render.Audio, options, target, ceiling);
        MasteringMetrics after = AudioMetricsAnalyzer.Analyze(processed);
        var moves = render.Report.AppliedMoves.ToList();
        if (options.MasterB)
            moves.Add("Finition B RC1: correction tonale douce et micro-nivellement +/-0,48 dB");
        if (options.SectionLevel != SectionLevelMode.Off)
            moves.Add($"Nivellement sections {options.SectionLevel} RC2: post-master, stéréo liée");
        moves.Add($"Finition: contrôle niveau et true peak ({ceiling:0.0} dBTP max)");
        return render with
        {
            Audio = processed,
            After = after,
            Report = render.Report with
            {
                AppliedMoves = moves,
                GainAppliedDb = after.EstimatedLufs - render.Before.EstimatedLufs
            }
        };
    }

    // Public, isolated entry point for deterministic DSP testing.
    public static WaveAudioData ProcessAudio(WaveAudioData original,
        AdaptiveFinishingOptions options, double targetLufs, double ceilingDb)
    {
        ArgumentNullException.ThrowIfNull(original);
        ArgumentNullException.ThrowIfNull(options);
        if (!options.Enabled) return original; // bit-exact legacy bypass
        if (original.Channels is < 1 or > 2 || original.SampleRate < 8000 ||
            original.Samples.Length % original.Channels != 0)
            throw new ArgumentException("Signal audio mono/stéréo invalide.", nameof(original));
        if (!double.IsFinite(targetLufs) || !double.IsFinite(ceilingDb) || ceilingDb > 0)
            throw new ArgumentOutOfRangeException(nameof(targetLufs), "Cible LUFS ou plafond TP invalide.");

        float[] samples = (float[])original.Samples.Clone();
        foreach (float sample in samples)
            if (!float.IsFinite(sample))
                throw new InvalidOperationException("Le signal contient des échantillons non finis.");
        if (samples.Length == 0) return original;

        if (options.MasterB)
        {
            // Same RBJ biquads as standalone RC1B Python reference (S = 1 shelves).
            // Filter is channel-linked in parameterization, with separate filter state.
            ApplyBiquadChain(samples, original.SampleRate, original.Channels);
            ApplyMicroDynamics(samples, original.SampleRate, original.Channels);
        }
        if (options.SectionLevel != SectionLevelMode.Off)
            ApplySectionLevel(samples, original.SampleRate, original.Channels, options.SectionLevel);

        var modified = original with { Samples = samples };
        double measured = AudioMetricsAnalyzer.MeasureLoudnessAndPeakOnly(modified).EstimatedLufs;
        if (double.IsFinite(measured) && measured > -90)
        {
            double gain = Math.Pow(10, Math.Clamp(targetLufs - measured, -20, 20) / 20);
            for (int i = 0; i < samples.Length; i++) samples[i] = (float)(samples[i] * gain);
        }
        // Uniform attenuation only. Never add a second brickwall limiter or squash drums.
        // Existing V6 guard uses 4x interpolation for true-peak measurement.
        return V6TruePeakGuard.Apply(modified, ceilingDb).Audio;
    }


    // Kept local to the App assembly: the validated AudioDspPrimitives type
    // belongs to Core and is intentionally internal to that assembly.
    private readonly record struct LocalBiquad(double B0, double B1, double B2, double A1, double A2);

    private static LocalBiquad Biquad(int rate, string type, double frequency, double gainDb, double q = 1)
    {
        double a = Math.Pow(10, gainDb / 40);
        double omega = 2 * Math.PI * Math.Min(frequency, rate * .48) / rate;
        double cos = Math.Cos(omega), sin = Math.Sin(omega);
        double alpha = type == "peak" ? sin / (2 * q) : sin / 2 * Math.Sqrt(2);
        double beta = 2 * Math.Sqrt(a) * alpha;
        double b0, b1, b2, a0, a1, a2;
        if (type == "peak")
        {
            b0 = 1 + alpha * a; b1 = -2 * cos; b2 = 1 - alpha * a;
            a0 = 1 + alpha / a; a1 = -2 * cos; a2 = 1 - alpha / a;
        }
        else if (type == "low")
        {
            b0 = a * ((a + 1) - (a - 1) * cos + beta);
            b1 = 2 * a * ((a - 1) - (a + 1) * cos);
            b2 = a * ((a + 1) - (a - 1) * cos - beta);
            a0 = (a + 1) + (a - 1) * cos + beta;
            a1 = -2 * ((a - 1) + (a + 1) * cos);
            a2 = (a + 1) + (a - 1) * cos - beta;
        }
        else
        {
            b0 = a * ((a + 1) + (a - 1) * cos + beta);
            b1 = -2 * a * ((a - 1) + (a + 1) * cos);
            b2 = a * ((a + 1) + (a - 1) * cos - beta);
            a0 = (a + 1) - (a - 1) * cos + beta;
            a1 = 2 * ((a - 1) - (a + 1) * cos);
            a2 = (a + 1) - (a - 1) * cos - beta;
        }
        return new LocalBiquad(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
    }

    private static void ApplyBiquadChain(float[] samples, int rate, int channels)
    {
        LocalBiquad[] filters =
        [
            Biquad(rate, "low", 70, -.20),
            Biquad(rate, "peak", 125, .48, 1),
            Biquad(rate, "peak", 350, -.15, .7),
            Biquad(rate, "peak", 3400, .35, .85),
            Biquad(rate, "high", 8500, .75)
        ];
        foreach (LocalBiquad filter in filters)
        {
            var x1 = new double[channels];
            var x2 = new double[channels];
            var y1 = new double[channels];
            var y2 = new double[channels];
            for (int k = 0; k < samples.Length; k++)
            {
                int c = k % channels;
                double input = samples[k];
                double output = filter.B0 * input + filter.B1 * x1[c] + filter.B2 * x2[c]
                    - filter.A1 * y1[c] - filter.A2 * y2[c];
                x2[c] = x1[c]; x1[c] = input;
                y2[c] = y1[c]; y1[c] = output;
                samples[k] = double.IsFinite(output) ? (float)output : 0f;
            }
        }
    }

    private static void ApplyMicroDynamics(float[] samples, int rate, int channels)
    {
        int frames = samples.Length / channels;
        int hop = Math.Max(1, rate / 2);
        int blocks = (frames + hop - 1) / hop;
        double[] energy = new double[blocks];
        for (int b = 0; b < blocks; b++)
        {
            int begin = b * hop, end = Math.Min(frames, begin + hop);
            double sum = 0;
            for (int f = begin; f < end; f++)
                for (int c = 0; c < channels; c++)
                {
                    double v = samples[f * channels + c];
                    sum += v * v;
                }
            energy[b] = sum / Math.Max(1, (end - begin) * channels) + 1e-12;
        }
        double[] smoothed = Gaussian(energy, 6);
        double[] rmsDb = smoothed.Select(x => 10 * Math.Log10(x + 1e-12)).ToArray();
        double[] active = rmsDb.Where(x => x > -50).ToArray();
        if (active.Length == 0) return;
        double anchor = Percentile(active, 55);
        double[] delta = new double[blocks];
        for (int i = 0; i < blocks; i++)
            delta[i] = rmsDb[i] < -48 ? 0 : Math.Clamp((anchor - rmsDb[i]) * .18, -.48, .48);
        ApplyInterpolatedGains(samples, channels, frames, hop, Gaussian(delta, 3));
    }

    private static void ApplySectionLevel(float[] samples, int rate, int channels, SectionLevelMode mode)
    {
        int frames = samples.Length / channels;
        int hop = rate;
        int blocks = (frames + hop - 1) / hop;
        double[] energy = new double[blocks];
        for (int b = 0; b < blocks; b++)
        {
            int begin = b * hop, end = Math.Min(frames, begin + hop);
            double sum = 0;
            for (int f = begin; f < end; f++)
                for (int c = 0; c < channels; c++)
                {
                    double v = samples[f * channels + c];
                    sum += v * v;
                }
            energy[b] = sum / Math.Max(1, (end - begin) * channels);
        }
        double[] smoothed = Gaussian(energy, 9);
        double[] db = smoothed.Select(x => 10 * Math.Log10(x + 1e-16)).ToArray();
        double[] active = db.Where(x => x > -34).ToArray();
        if (active.Length == 0) return;
        double anchor = Percentile(active, 72);
        double maxBoost = mode == SectionLevelMode.Doux ? 1.85 : 2.65;
        double ratio = mode == SectionLevelMode.Doux ? .48 : .70;
        double maxCut = mode == SectionLevelMode.Doux ? -.40 : -.70;
        double[] delta = new double[blocks];
        for (int i = 0; i < blocks; i++)
            delta[i] = db[i] < -38 ? 0 : Math.Clamp((anchor - db[i]) * ratio, maxCut, maxBoost);
        ApplyInterpolatedGains(samples, channels, frames, hop, Gaussian(delta, 5));
    }

    private static void ApplyInterpolatedGains(float[] samples, int channels, int frames,
        int hop, double[] dbCurve)
    {
        for (int frame = 0; frame < frames; frame++)
        {
            int index = Math.Min(frame / hop, dbCurve.Length - 1);
            int next = Math.Min(index + 1, dbCurve.Length - 1);
            double fraction = next == index ? 0 : (frame - (long)index * hop) / (double)hop;
            double db = dbCurve[index] + (dbCurve[next] - dbCurve[index]) * fraction;
            float gain = (float)Math.Pow(10, db / 20);
            int offset = frame * channels;
            for (int c = 0; c < channels; c++) samples[offset + c] *= gain;
        }
    }

    private static double[] Gaussian(double[] values, double sigma)
    {
        int radius = (int)Math.Floor(4 * sigma + .5); // scipy gaussian_filter1d truncate=4
        double[] kernel = new double[2 * radius + 1];
        double sum = 0;
        for (int j = -radius; j <= radius; j++)
        {
            double v = Math.Exp(-.5 * j * j / (sigma * sigma));
            kernel[j + radius] = v;
            sum += v;
        }
        var output = new double[values.Length];
        for (int i = 0; i < values.Length; i++)
        {
            double v = 0;
            for (int j = -radius; j <= radius; j++)
                v += values[Math.Clamp(i + j, 0, values.Length - 1)] * (kernel[j + radius] / sum);
            output[i] = v;
        }
        return output;
    }

    private static double Percentile(double[] values, double percentile)
    {
        Array.Sort(values);
        double location = (values.Length - 1) * percentile / 100;
        int low = (int)location;
        int high = Math.Min(values.Length - 1, low + 1);
        return values[low] + (values[high] - values[low]) * (location - low);
    }
}

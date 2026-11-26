using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public static class V6RestorationEngine
{
    private const int DynamicBlockFrames = 1024;

    public static V6RestorationResult Restore(
        WaveAudioData source,
        MasteringMetrics commonMetrics,
        V6RestorationOptions options,
        IProgress<string>? progress = null,
        bool captureRemoved = false)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(commonMetrics);
        ArgumentNullException.ThrowIfNull(options);

        progress?.Report("Diagnostic source Suno V6");
        V6SourceMetrics metrics = V6SourceAnalyzer.Analyze(source);
        V6RestorationPlan plan = V6RestorationPlanner.Build(metrics, commonMetrics, options);
        var moves = new List<string> { "Source Suno V6 - restauration adaptative" };

        if (!plan.HasAnyCorrection)
        {
            moves.Add("V6 - aucune correction source nécessaire");
            return new V6RestorationResult(
                source,
                metrics,
                plan,
                new V6RestorationReport(0, 0, 0, moves));
        }

        float[] samples = (float[])source.Samples.Clone();
        progress?.Report("Restauration spatiale V6");
        ApplyStereoRecoveryInPlace(samples, source.SampleRate, source.Channels, plan);

        if (plan.LowSideReductionDb > .01)
        {
            moves.Add($"V6 - grave latéral recentré: -{plan.LowSideReductionDb:0.00} dB max sous 120 Hz");
        }

        if (plan.StereoRecovery1500To4000Db > .01)
        {
            moves.Add($"V6 - récupération stéréo 1,5-4 kHz: commande +{plan.StereoRecovery1500To4000Db:0.00} dB Side");
        }
        else
        {
            moves.Add("V6 - récupération stéréo: non requise");
        }

        if (Math.Abs(plan.PresenceCorrectionDb) > .01)
        {
            progress?.Report("Compensation présence V6");
            ApplyMidPeakingInPlace(samples, source.SampleRate, source.Channels, 2850, .82, plan.PresenceCorrectionDb);
            string sign = plan.PresenceCorrectionDb > 0 ? "+" : string.Empty;
            moves.Add($"V6 - présence utile: {sign}{plan.PresenceCorrectionDb:0.00} dB");
        }
        else
        {
            moves.Add("V6 - présence: aucune correction");
        }

        // Monitoring-only snapshot: stereo recovery and presence have already run.
        // When requested, preserve exactly the input of the three attenuation
        // stages. No second DSP pass, no phase alignment, and no added EQ.
        // In normal renders and batch exports this allocation never occurs.
        float[]? removedSamples = captureRemoved &&
            (plan.BoxinessMaxReductionDb > .01 ||
             plan.SibilanceMaxReductionDb > .01 ||
             plan.HfArtifactMaxReductionDb > .01)
            ? (float[])samples.Clone() : null;

        double maxBoxiness = 0;
        if (plan.BoxinessMaxReductionDb > .01)
        {
            progress?.Report("Contrôle boxiness V6");
            double[] activities = BuildDynamicActivities(source, 500, 1000, null, null, .56);
            maxBoxiness = ApplyDynamicMidPeakingInPlace(
                samples,
                source.SampleRate,
                source.Channels,
                740,
                1.00,
                plan.BoxinessMaxReductionDb,
                activities);
            moves.Add(maxBoxiness > .02
                ? $"V6 - boxiness: -{maxBoxiness:0.00} dB max @ 740 Hz"
                : "V6 - boxiness: correction non déclenchée");
        }
        else
        {
            moves.Add("V6 - boxiness: aucune correction");
        }

        double maxSibilance = 0;
        if (plan.SibilanceMaxReductionDb > .01)
        {
            progress?.Report("Contrôle sifflantes V6");
            double[] activities = BuildDynamicActivities(source, 5000, 9000, 1500, 4000, .66);
            maxSibilance = ApplyDynamicMidPeakingInPlace(
                samples,
                source.SampleRate,
                source.Channels,
                7000,
                1.05,
                plan.SibilanceMaxReductionDb,
                activities);
            moves.Add(maxSibilance > .02
                ? $"V6 - contrôle sifflantes: -{maxSibilance:0.00} dB max"
                : "V6 - contrôle sifflantes: non déclenché");
        }
        else
        {
            moves.Add("V6 - contrôle sifflantes: non requis");
        }

        double maxHf = 0;
        if (plan.HfArtifactMaxReductionDb > .01)
        {
            progress?.Report("Suppression artefacts HF V6");
            double[] activities = BuildDynamicActivities(source, 8000, 16000, null, null, .48);
            maxHf = ApplyDynamicStereoShelfInPlace(
                samples,
                source.SampleRate,
                source.Channels,
                10500,
                plan.HfArtifactMaxReductionDb,
                activities);
            moves.Add(maxHf > .02
                ? $"V6 - artefacts HF: -{maxHf:0.00} dB max"
                : "V6 - artefacts HF: suppression non déclenchée");
        }
        else
        {
            moves.Add("V6 - artefacts HF: aucune suppression");
        }

        SanitizeFinite(samples);
        WaveAudioData? removedAudio = null;
        if (removedSamples is not null)
        {
            // Reuse the snapshot allocation for the exact dry - wet residual.
            // The final mastered samples are not touched by this calculation.
            for (int i = 0; i < removedSamples.Length; i++)
            {
                float dry = float.IsFinite(removedSamples[i]) ? removedSamples[i] : 0f;
                removedSamples[i] = dry - samples[i];
            }
            removedAudio = source with
            {
                Samples = removedSamples,
                SourceFormat = "PAXLAB V6 - signal attenue (non masterise)"
            };
        }
        var restored = new WaveAudioData(source.SampleRate, source.Channels, source.BitsPerSample, samples, source.SourceFormat);
        return new V6RestorationResult(
            restored,
            metrics,
            plan,
            new V6RestorationReport(maxBoxiness, maxSibilance, maxHf, moves))
        {
            RemovedAudio = removedAudio
        };
    }

    public static MasteringSettings ProtectLegacyV6Path(MasteringSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);
        return settings with
        {
            StereoSpace = false,
            StereoWidth = Math.Min(100, settings.StereoWidth),
            VocalPresence = false
        };
    }

    private static void ApplyStereoRecoveryInPlace(float[] samples, int sampleRate, int channels, V6RestorationPlan plan)
    {
        if (channels < 2 || samples.Length < 2) return;
        if (plan.LowSideReductionDb <= .01 &&
            plan.StereoRecovery700To1500Db <= .01 &&
            plan.StereoRecovery1500To4000Db <= .01 &&
            plan.StereoRecovery4000To6000Db <= .01)
        {
            return;
        }

        BiquadProcessor low = new(BiquadCoefficients.LowShelf(sampleRate, 110, -plan.LowSideReductionDb));
        BiquadProcessor lowWidth = new(BiquadCoefficients.Peaking(sampleRate, 1050, 1.00, plan.StereoRecovery700To1500Db));
        BiquadProcessor mainWidth = new(BiquadCoefficients.Peaking(sampleRate, 2450, .90, plan.StereoRecovery1500To4000Db));
        BiquadProcessor upperWidth = new(BiquadCoefficients.Peaking(sampleRate, 4900, 1.40, plan.StereoRecovery4000To6000Db));
        int frames = samples.Length / channels;

        for (int frame = 0; frame < frames; frame++)
        {
            int index = frame * channels;
            double left = samples[index];
            double right = samples[index + 1];
            double mid = (left + right) * .5;
            double side = (left - right) * .5;
            side = low.Process(side);
            side = lowWidth.Process(side);
            side = mainWidth.Process(side);
            side = upperWidth.Process(side);
            samples[index] = (float)(mid + side);
            samples[index + 1] = (float)(mid - side);
        }
    }

    private static void ApplyMidPeakingInPlace(float[] samples, int sampleRate, int channels, double frequency, double q, double gainDb)
    {
        if (Math.Abs(gainDb) <= .001 || samples.Length == 0) return;
        BiquadProcessor filter = new(BiquadCoefficients.Peaking(sampleRate, frequency, q, gainDb));
        int frames = samples.Length / channels;
        for (int frame = 0; frame < frames; frame++)
        {
            int index = frame * channels;
            if (channels < 2)
            {
                samples[index] = (float)filter.Process(samples[index]);
                continue;
            }

            double left = samples[index];
            double right = samples[index + 1];
            double mid = (left + right) * .5;
            double side = (left - right) * .5;
            double corrected = filter.Process(mid);
            samples[index] = (float)(corrected + side);
            samples[index + 1] = (float)(corrected - side);
        }
    }

    private static double ApplyDynamicMidPeakingInPlace(
        float[] samples,
        int sampleRate,
        int channels,
        double frequency,
        double q,
        double maxReductionDb,
        double[] activities)
    {
        if (maxReductionDb <= .001 || activities.Length == 0) return 0;
        BiquadProcessor filter = new(BiquadCoefficients.Peaking(sampleRate, frequency, q, -maxReductionDb));
        int frames = samples.Length / channels;
        double maxApplied = 0;
        for (int frame = 0; frame < frames; frame++)
        {
            int block = Math.Min(activities.Length - 1, frame / DynamicBlockFrames);
            double activity = activities[block];
            maxApplied = Math.Max(maxApplied, maxReductionDb * activity);
            int index = frame * channels;
            if (channels < 2)
            {
                double dry = samples[index];
                double wet = filter.Process(dry);
                samples[index] = (float)(dry + (wet - dry) * activity);
                continue;
            }

            double left = samples[index];
            double right = samples[index + 1];
            double mid = (left + right) * .5;
            double side = (left - right) * .5;
            double wetMid = filter.Process(mid);
            double correctedMid = mid + (wetMid - mid) * activity;
            samples[index] = (float)(correctedMid + side);
            samples[index + 1] = (float)(correctedMid - side);
        }
        return maxApplied;
    }

    private static double ApplyDynamicStereoShelfInPlace(
        float[] samples,
        int sampleRate,
        int channels,
        double frequency,
        double maxReductionDb,
        double[] activities)
    {
        if (maxReductionDb <= .001 || activities.Length == 0) return 0;
        BiquadCoefficients coefficients = BiquadCoefficients.HighShelf(sampleRate, frequency, -maxReductionDb);
        var filters = Enumerable.Range(0, channels).Select(_ => new BiquadProcessor(coefficients)).ToArray();
        int frames = samples.Length / channels;
        double maxApplied = 0;
        for (int frame = 0; frame < frames; frame++)
        {
            int block = Math.Min(activities.Length - 1, frame / DynamicBlockFrames);
            double activity = activities[block];
            maxApplied = Math.Max(maxApplied, maxReductionDb * activity);
            int baseIndex = frame * channels;
            for (int channel = 0; channel < channels; channel++)
            {
                int index = baseIndex + channel;
                double dry = samples[index];
                double wet = filters[channel].Process(dry);
                samples[index] = (float)(dry + (wet - dry) * activity);
            }
        }
        return maxApplied;
    }

    private static double[] BuildDynamicActivities(
        WaveAudioData source,
        double targetLowHz,
        double targetHighHz,
        double? referenceLowHz,
        double? referenceHighHz,
        double thresholdPercentile)
    {
        int frames = source.Samples.Length / source.Channels;
        int blockCount = Math.Max(1, (frames + DynamicBlockFrames - 1) / DynamicBlockFrames);
        double targetCenter = Math.Sqrt(targetLowHz * targetHighHz);
        double targetQ = Math.Max(.35, targetCenter / Math.Max(1, targetHighHz - targetLowHz));
        BiquadProcessor targetFilter = new(BiquadCoefficients.BandPass(source.SampleRate, targetCenter, targetQ));
        BiquadProcessor? referenceFilter = null;
        if (referenceLowHz.HasValue && referenceHighHz.HasValue)
        {
            double referenceCenter = Math.Sqrt(referenceLowHz.Value * referenceHighHz.Value);
            double referenceQ = Math.Max(.35, referenceCenter / Math.Max(1, referenceHighHz.Value - referenceLowHz.Value));
            referenceFilter = new BiquadProcessor(BiquadCoefficients.BandPass(source.SampleRate, referenceCenter, referenceQ));
        }

        var raw = new double[blockCount];
        for (int block = 0; block < blockCount; block++)
        {
            int start = block * DynamicBlockFrames;
            int end = Math.Min(frames, start + DynamicBlockFrames);
            double targetSquare = 0;
            double referenceSquare = 0;
            int count = Math.Max(1, end - start);
            for (int frame = start; frame < end; frame++)
            {
                int index = frame * source.Channels;
                double left = source.Samples[index];
                double right = source.Channels > 1 ? source.Samples[index + 1] : left;
                double mid = (left + right) * .5;
                double target = targetFilter.Process(mid);
                targetSquare += target * target;
                if (referenceFilter is not null)
                {
                    double reference = referenceFilter.Process(mid);
                    referenceSquare += reference * reference;
                }
            }

            double targetRms = Math.Sqrt(targetSquare / count) + 1e-12;
            raw[block] = referenceFilter is null
                ? 20 * Math.Log10(targetRms)
                : 20 * Math.Log10(targetRms / (Math.Sqrt(referenceSquare / count) + 1e-12));
        }

        double threshold = Percentile(raw, thresholdPercentile);
        double high = Percentile(raw, Math.Min(.96, thresholdPercentile + .30));
        double span = Math.Max(1.0, high - threshold);
        var activities = new double[blockCount];
        double state = 0;
        for (int block = 0; block < blockCount; block++)
        {
            double desired = Math.Clamp((raw[block] - threshold) / span, 0, 1);
            double coefficient = desired > state ? .72 : .18;
            state += (desired - state) * coefficient;
            activities[block] = Math.Clamp(state, 0, 1);
        }
        return activities;
    }

    private static double Percentile(IReadOnlyList<double> values, double percentile)
    {
        if (values.Count == 0) return 0;
        double[] sorted = values.Where(double.IsFinite).OrderBy(value => value).ToArray();
        if (sorted.Length == 0) return 0;
        if (sorted.Length == 1) return sorted[0];
        double position = Math.Clamp(percentile, 0, 1) * (sorted.Length - 1);
        int lower = (int)Math.Floor(position);
        int upper = (int)Math.Ceiling(position);
        if (lower == upper) return sorted[lower];
        double fraction = position - lower;
        return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
    }

    private static void SanitizeFinite(float[] samples)
    {
        for (int index = 0; index < samples.Length; index++)
        {
            if (!float.IsFinite(samples[index])) samples[index] = 0;
        }
    }

    private readonly record struct BiquadCoefficients(double B0, double B1, double B2, double A1, double A2)
    {
        public static BiquadCoefficients Peaking(int sampleRate, double frequency, double q, double gainDb)
        {
            double a = Math.Pow(10, gainDb / 40);
            double omega = 2 * Math.PI * ClampFrequency(sampleRate, frequency) / sampleRate;
            double alpha = Math.Sin(omega) / (2 * Math.Max(.05, q));
            double cos = Math.Cos(omega);
            double b0 = 1 + alpha * a;
            double b1 = -2 * cos;
            double b2 = 1 - alpha * a;
            double a0 = 1 + alpha / a;
            double a1 = -2 * cos;
            double a2 = 1 - alpha / a;
            return Normalize(b0, b1, b2, a0, a1, a2);
        }

        public static BiquadCoefficients BandPass(int sampleRate, double frequency, double q)
        {
            double omega = 2 * Math.PI * ClampFrequency(sampleRate, frequency) / sampleRate;
            double alpha = Math.Sin(omega) / (2 * Math.Max(.05, q));
            double b0 = alpha;
            double b1 = 0;
            double b2 = -alpha;
            double a0 = 1 + alpha;
            double a1 = -2 * Math.Cos(omega);
            double a2 = 1 - alpha;
            return Normalize(b0, b1, b2, a0, a1, a2);
        }

        public static BiquadCoefficients HighShelf(int sampleRate, double frequency, double gainDb)
            => Shelf(sampleRate, frequency, gainDb, high: true);

        public static BiquadCoefficients LowShelf(int sampleRate, double frequency, double gainDb)
            => Shelf(sampleRate, frequency, gainDb, high: false);

        private static BiquadCoefficients Shelf(int sampleRate, double frequency, double gainDb, bool high)
        {
            double a = Math.Pow(10, gainDb / 40);
            double omega = 2 * Math.PI * ClampFrequency(sampleRate, frequency) / sampleRate;
            double cos = Math.Cos(omega);
            double sin = Math.Sin(omega);
            double alpha = sin / 2 * Math.Sqrt(2);
            double beta = 2 * Math.Sqrt(a) * alpha;
            double b0;
            double b1;
            double b2;
            double a0;
            double a1;
            double a2;

            if (high)
            {
                b0 = a * ((a + 1) + (a - 1) * cos + beta);
                b1 = -2 * a * ((a - 1) + (a + 1) * cos);
                b2 = a * ((a + 1) + (a - 1) * cos - beta);
                a0 = (a + 1) - (a - 1) * cos + beta;
                a1 = 2 * ((a - 1) - (a + 1) * cos);
                a2 = (a + 1) - (a - 1) * cos - beta;
            }
            else
            {
                b0 = a * ((a + 1) - (a - 1) * cos + beta);
                b1 = 2 * a * ((a - 1) - (a + 1) * cos);
                b2 = a * ((a + 1) - (a - 1) * cos - beta);
                a0 = (a + 1) + (a - 1) * cos + beta;
                a1 = -2 * ((a - 1) + (a + 1) * cos);
                a2 = (a + 1) + (a - 1) * cos - beta;
            }
            return Normalize(b0, b1, b2, a0, a1, a2);
        }

        private static BiquadCoefficients Normalize(double b0, double b1, double b2, double a0, double a1, double a2)
            => new(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);

        private static double ClampFrequency(int sampleRate, double frequency)
            => Math.Clamp(frequency, 10, sampleRate * .48);
    }

    private sealed class BiquadProcessor
    {
        private readonly BiquadCoefficients _c;
        private double _z1;
        private double _z2;

        public BiquadProcessor(BiquadCoefficients coefficients) => _c = coefficients;

        public double Process(double input)
        {
            double output = _c.B0 * input + _z1;
            _z1 = _c.B1 * input - _c.A1 * output + _z2;
            _z2 = _c.B2 * input - _c.A2 * output;
            return output;
        }
    }
}

using System.Diagnostics;
using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public static class MasteringEngine
{
    private const double YoutubeSafeTargetLufs = -14.4;
    private const double YoutubeMaxLufs = -14.0;
    private const double YoutubePeakTargetDb = -2.2;
    private const double YoutubePeakTriggerDb = -3.4;
    private const double YoutubePeakPolishThresholdDb = -15.0;

    public static MasteringRenderResult Render(WaveAudioData source, MasteringSettings settings, IProgress<string>? progress = null)
    {
        var watch = Stopwatch.StartNew();
        progress?.Report("Analyse du morceau");
        MasteringMetrics before = AudioMetricsAnalyzer.Analyze(source);
        ProcessingProfile profile = GetProcessingProfile(settings);
        BassPunchProfile bassPunch = GetBassPunchProfile(settings, before);

        progress?.Report("Réparation source");
        CleanupResult cleanup = Cleanup(source.Samples, source.Channels, settings);
        float[] current = cleanup.Samples;
        int clippedSamples = cleanup.ClippedSamples;
        int clicksRepaired = cleanup.ClicksRepaired;

        progress?.Report("Correction du spectre");
        bool vocalPresence = settings.VocalPresence && !settings.AntiFatigue;
        BiquadCoefficients[] filters =
        {
            AudioDspPrimitives.HighPass(source.SampleRate, profile.SubControlFrequency, 0.7),
            AudioDspPrimitives.LowShelf(source.SampleRate, 115, profile.LowShelfGain),
            AudioDspPrimitives.LowShelf(source.SampleRate, 72, bassPunch.Active ? 0.32 * bassPunch.Amount : 0),
            AudioDspPrimitives.Peaking(source.SampleRate, 92, 0.9, bassPunch.Active ? 1.15 * bassPunch.Amount : 0),
            AudioDspPrimitives.Peaking(source.SampleRate, 320, 0.9, settings.AutoIntensity == "youtube" ? -1.15 : settings.Id == "power" ? -0.4 : -0.9),
            AudioDspPrimitives.Peaking(source.SampleRate, 240, 0.85, bassPunch.Active ? -0.7 * bassPunch.Amount : 0),
            AudioDspPrimitives.Peaking(source.SampleRate, 300, 0.85, vocalPresence ? -0.45 : 0),
            AudioDspPrimitives.Peaking(source.SampleRate, 1700, 0.8, profile.PresenceGain),
            AudioDspPrimitives.Peaking(source.SampleRate, 1850, 0.95, vocalPresence ? (settings.AutoIntensity == "youtube" ? 0.65 : 0.8) : 0),
            AudioDspPrimitives.Peaking(source.SampleRate, 3100, 1.05, vocalPresence ? 0.38 : 0),
            AudioDspPrimitives.Peaking(source.SampleRate, 3600, 1.25, profile.HarshDipGain),
            AudioDspPrimitives.Peaking(source.SampleRate, 7200, 1.05, profile.HighShelfGain * 0.58),
            AudioDspPrimitives.Peaking(source.SampleRate, 11200, 1.15, profile.FizzDipGain),
            AudioDspPrimitives.HighShelf(source.SampleRate, 14500, profile.AirGain - profile.DehissReductionDb * 0.35)
        };

        AudioDspPrimitives.ApplyBiquadChainInPlace(current, source.Channels, filters);
        progress?.Report("Optimisation dynamique");
        AudioDspPrimitives.ApplyFirefoxWebAudioCompressorInPlace(
            current,
            source.SampleRate,
            source.Channels,
            profile.CompressorThreshold,
            profile.CompressorRatio,
            22,
            0.012,
            0.19);
        AudioDspPrimitives.ApplyGainInPlace(current, profile.MakeupGain);

        double sourceStereoRatio = AnalyzeStereoRatio(source.Samples, source.SampleRate, source.Channels);
        AudioDspPrimitives.ApplyStereoWidthInPlace(current, source.Channels, settings.StereoWidth, sourceStereoRatio);
        AudioDspPrimitives.ApplyStereoSpaceInPlace(current, source.SampleRate, source.Channels, settings.StereoSpace);

        bool youtube = settings.AutoIntensity == "youtube";
        int density = settings.SpacePreserve || youtube
            ? JsRoundToInt(settings.Density * (youtube ? 0.72 : 0.54))
            : settings.Density;
        AudioDspPrimitives.ApplyGentleDensityInPlace(current, density);

        progress?.Report("Normalisation du niveau");
        double maxPeakDb = youtube ? Math.Min(settings.MaxPeakDb, -1.8) : settings.SpacePreserve ? Math.Min(settings.MaxPeakDb, -2.0) : settings.MaxPeakDb;
        double targetLufs = youtube ? Math.Min(settings.TargetLufsEstimate, YoutubeSafeTargetLufs) : settings.SpacePreserve ? settings.TargetLufsEstimate - 0.45 : settings.TargetLufsEstimate;
        double targetRmsDb = youtube ? Math.Min(settings.TargetRmsDb, -16.8) : settings.SpacePreserve ? settings.TargetRmsDb - 0.45 : settings.TargetRmsDb;
        ApplySafeTargetGainInPlace(current, targetRmsDb, maxPeakDb);
        double limiterReduction1 = AudioDspPrimitives.ApplyLinkedLookaheadLimiterInPlace(current, source.SampleRate, source.Channels, maxPeakDb);

        ApplyPostLoudnessCalibrationInPlace(current, source.SampleRate, source.Channels, targetLufs, maxPeakDb, settings, out double limiterReduction2);
        AudioDspPrimitives.RemoveDcOffsetInPlace(current, source.Channels);
        AudioDspPrimitives.ApplyEdgeFadeInPlace(current, source.SampleRate, source.Channels);

        double youtubeClampGainDb = 0;
        double youtubePeakLiftDb = 0;
        if (youtube)
        {
            YoutubeClampResult initialClamp = ApplyYoutubeFinalLoudnessClamp(current, source.SampleRate, source.Channels);
            current = initialClamp.Output;
            youtubeClampGainDb += initialClamp.ClampGainDb;

            YoutubePeakPolishResult polish = ApplyYoutubePeakPolish(current, source.SampleRate, source.Channels, maxPeakDb, initialClamp.Metrics);
            current = polish.Output;
            youtubePeakLiftDb = polish.PeakLiftDb;
            youtubeClampGainDb += polish.LoudnessTrimDb;

            if (youtubePeakLiftDb > 0.05)
            {
                YoutubeClampResult finalClamp = ApplyYoutubeFinalLoudnessClamp(current, source.SampleRate, source.Channels, polish.Metrics);
                current = finalClamp.Output;
                youtubeClampGainDb += finalClamp.ClampGainDb;
            }
        }

        progress?.Report("Sécurité peak");
        double limiterReduction3 = AudioDspPrimitives.ApplyLinkedLookaheadLimiterInPlace(current, source.SampleRate, source.Channels, maxPeakDb);
        var output = new WaveAudioData(source.SampleRate, source.Channels, source.BitsPerSample, current, source.SourceFormat);
        MasteringMetrics after = AudioMetricsAnalyzer.Analyze(output);
        watch.Stop();

        var moves = new List<string> { $"Réparation source {RepairLabel(settings.SourceRepair).ToLowerInvariant()}" };
        if (clippedSamples > 0) moves.Add("De-clipper prudent");
        if (clicksRepaired > 0) moves.Add("De-clicker micro-clics");
        if (profile.DehissReductionDb > 0.5 && before.HighTotalRatio > 0.34) moves.Add("De-hiss aigu léger");
        if (Math.Abs(profile.FizzDipGain) > 0.8) moves.Add(settings.AntiFatigue ? "Lissage brillance IA" : "Anti-fizz et contrôle des aigus");
        if (vocalPresence) moves.Add("Présence vocale subtile");
        if (bassPunch.Active) moves.Add(bassPunch.SafeMode ? "Basses punchy à dose réduite" : "Basses punchy et bas contrôlé");
        if (settings.StereoSpace || Math.Abs(settings.StereoWidth - 100) > 0.1) moves.Add("Espace stéréo M/S sécurisé");
        if (density > 0) moves.Add("Densité harmonique douce");
        moves.Add(youtube ? "Compression YouTube douce" : "Compression douce");
        moves.Add($"Cible {targetLufs:0.0} LUFS intégré est.");
        moves.Add($"Ceiling {maxPeakDb:0.0} dBTP est.");
        if (youtubePeakLiftDb > 0.2) moves.Add($"Peak polish YouTube +{youtubePeakLiftDb:0.0} dB crête");
        if (youtubeClampGainDb < -0.05) moves.Add($"Clamp YouTube final {youtubeClampGainDb:0.0} dB");
        moves.Add("Limiteur stéréo lié avec lookahead");

        MasteringReport report = new(
            settings.Label,
            moves,
            clippedSamples,
            clicksRepaired,
            Math.Max(limiterReduction1, Math.Max(limiterReduction2, limiterReduction3)),
            after.EstimatedLufs - before.EstimatedLufs,
            PercentChange(before.BrightnessRatio + before.FizzRatio, after.BrightnessRatio + after.FizzRatio),
            PercentChange(before.LowRatio, after.LowRatio),
            PercentChange(sourceStereoRatio, AnalyzeStereoRatio(current, source.SampleRate, source.Channels)),
            watch.Elapsed.TotalMilliseconds,
            settings);

        return new MasteringRenderResult(output, before, after, report);
    }

    private static void ApplySafeTargetGainInPlace(float[] samples, double targetRmsDb, double maxPeakDb)
    {
        double sum = 0;
        double peak = 0;
        foreach (float raw in samples)
        {
            double sample = double.IsFinite(raw) ? raw : 0;
            sum += sample * sample;
            peak = Math.Max(peak, Math.Abs(sample));
        }

        double rms = Math.Sqrt(sum / Math.Max(1, samples.Length));
        if (peak <= 0 || rms <= 0) return;

        double rmsDb = AudioDspPrimitives.LinearToDb(rms);
        double peakDb = AudioDspPrimitives.LinearToDb(peak);
        double requiredLiftDb = targetRmsDb - rmsDb;
        double gainForRms = AudioDspPrimitives.DbToLinear(requiredLiftDb);
        double peakCeilingLiftDb = maxPeakDb - peakDb;
        double limiterWorkRoomDb = requiredLiftDb > 8 ? 6.4 : requiredLiftDb > 6 ? 5.2 : requiredLiftDb > 4 ? 3.4 : 2.1;
        double protectedLiftLimitDb = AudioDspPrimitives.Clamp(
            Math.Max(1.2, peakCeilingLiftDb + limiterWorkRoomDb),
            1.2,
            12.8);
        double finalGain = Math.Min(gainForRms, AudioDspPrimitives.DbToLinear(protectedLiftLimitDb));
        AudioDspPrimitives.ApplyGainInPlace(samples, finalGain);
    }

    private static void ApplyPostLoudnessCalibrationInPlace(float[] samples, int sampleRate, int channels, double targetLufs, double maxPeakDb, MasteringSettings settings, out double limiterReduction)
    {
        limiterReduction = 0;
        double maxExtra = (settings.AutoIntensity == "impact" ? 4.2 : settings.AutoIntensity == "youtube" ? 2.6 : settings.AntiFatigue || settings.AutoIntensity == "safe" ? 2.2 : 3.2) * (settings.SpacePreserve ? 0.62 : 1);
        double upwardCorrection = 0;

        if (settings.AutoIntensity != "youtube")
        {
            LoudnessPeakMeasurement initial = MeasureLoudnessAndPeak(samples, sampleRate, channels);
            double initialGap = targetLufs - initial.IntegratedLufs;
            if (initialGap < -0.35)
            {
                double trimDb = AudioDspPrimitives.Clamp(initialGap, -6, 0);
                AudioDspPrimitives.ApplyGainInPlace(samples, AudioDspPrimitives.DbToLinear(trimDb));
                double trimmedReduction = AudioDspPrimitives.ApplyLinkedLookaheadLimiterInPlace(samples, sampleRate, channels, maxPeakDb);
                limiterReduction = Math.Max(limiterReduction, trimmedReduction);
            }
        }

        for (int pass = 0; pass < 3; pass++)
        {
            LoudnessPeakMeasurement metrics = MeasureLoudnessAndPeak(samples, sampleRate, channels);
            double gap = targetLufs - metrics.IntegratedLufs;
            if (gap <= 0.35 || upwardCorrection >= maxExtra) break;
            double currentHeadroom = Math.Max(0, -metrics.ApproxTruePeakDb);
            double ceilingHeadroom = Math.Abs(maxPeakDb);
            double roomBeforeLimiter = Math.Max(0, currentHeadroom - ceilingHeadroom);
            double limiterAllowance = (settings.AutoIntensity == "impact" ? 1.8 : settings.AutoIntensity == "youtube" ? 0.9 : settings.AntiFatigue || settings.AutoIntensity == "safe" ? 0.8 : 1.25) * (settings.SpacePreserve ? 0.45 : 1);
            double passGain = AudioDspPrimitives.Clamp(Math.Min(gap, Math.Min(roomBeforeLimiter + limiterAllowance, maxExtra - upwardCorrection)), 0, 2.4);
            if (passGain < 0.15) break;
            AudioDspPrimitives.ApplyGainInPlace(samples, AudioDspPrimitives.DbToLinear(passGain));
            double passReduction = AudioDspPrimitives.ApplyLinkedLookaheadLimiterInPlace(samples, sampleRate, channels, maxPeakDb);
            limiterReduction = Math.Max(limiterReduction, passReduction);
            upwardCorrection += passGain;
        }
    }

    private static YoutubeClampResult ApplyYoutubeFinalLoudnessClamp(float[] source, int sampleRate, int channels, LoudnessPeakMetrics? knownMetrics = null)
    {
        LoudnessPeakMetrics before = knownMetrics ?? AnalyzeSamples(source, sampleRate, channels);
        if (before.EstimatedLufs <= YoutubeSafeTargetLufs) return new YoutubeClampResult(source, 0, before);
        double clampGainDb = AudioDspPrimitives.Clamp(YoutubeSafeTargetLufs - before.EstimatedLufs, -8, 0);
        AudioDspPrimitives.ApplyGainInPlace(source, AudioDspPrimitives.DbToLinear(clampGainDb));
        return new YoutubeClampResult(source, clampGainDb, AnalyzeSamples(source, sampleRate, channels));
    }

    private static YoutubePeakPolishResult ApplyYoutubePeakPolish(float[] source, int sampleRate, int channels, double maxPeakDb, LoudnessPeakMetrics? knownMetrics = null)
    {
        LoudnessPeakMetrics before = knownMetrics ?? AnalyzeSamples(source, sampleRate, channels);
        double polishTargetDb = Math.Min(YoutubePeakTargetDb, maxPeakDb);
        if (
            before.EstimatedLufs > YoutubeMaxLufs - 0.1 ||
            before.PeakLinear <= 0 ||
            before.PeakDb >= YoutubePeakTriggerDb ||
            before.PeakDb >= polishTargetDb)
        {
            return new YoutubePeakPolishResult(source, 0, 0, before);
        }

        double desiredPeakLiftDb = AudioDspPrimitives.Clamp(polishTargetDb - before.PeakDb, 0, 2.4);
        if (desiredPeakLiftDb < 0.35) return new YoutubePeakPolishResult(source, 0, 0, before);

        double threshold = AudioDspPrimitives.DbToLinear(YoutubePeakPolishThresholdDb);
        double maxMultiplier = AudioDspPrimitives.DbToLinear(desiredPeakLiftDb);
        double peakSpan = Math.Max(before.PeakLinear - threshold, 1e-6);
        float[] output = source;
        for (int index = 0; index < output.Length; index++)
        {
            double sample = double.IsFinite(output[index]) ? output[index] : 0;
            double abs = Math.Abs(sample);
            if (abs <= threshold)
            {
                output[index] = (float)sample;
                continue;
            }
            double weight = AudioDspPrimitives.Clamp((abs - threshold) / peakSpan, 0, 1);
            double shapedWeight = weight * weight;
            double multiplier = 1 + (maxMultiplier - 1) * shapedWeight;
            output[index] = (float)(sample * multiplier);
        }

        LoudnessPeakMetrics after = AnalyzeSamples(output, sampleRate, channels);
        double loudnessTrimDb = 0;
        if (after.EstimatedLufs > YoutubeSafeTargetLufs)
        {
            loudnessTrimDb = AudioDspPrimitives.Clamp(YoutubeSafeTargetLufs - after.EstimatedLufs, -2, 0);
            AudioDspPrimitives.ApplyGainInPlace(output, AudioDspPrimitives.DbToLinear(loudnessTrimDb));
            after = AnalyzeSamples(output, sampleRate, channels);
        }
        return new YoutubePeakPolishResult(output, Math.Max(0, after.PeakDb - before.PeakDb), loudnessTrimDb, after);
    }

    private static LoudnessPeakMeasurement MeasureLoudnessAndPeak(float[] samples, int sampleRate, int channels)
    {
        LoudnessPeakMetrics metrics = AnalyzeSamples(samples, sampleRate, channels);
        double approxTruePeakDb = metrics.PeakLinear > 0 ? metrics.PeakDb + 0.35 : metrics.PeakDb;
        return new LoudnessPeakMeasurement(metrics.EstimatedLufs, metrics.PeakDb, approxTruePeakDb);
    }

    private static LoudnessPeakMetrics AnalyzeSamples(float[] samples, int sampleRate, int channels)
    {
        return AudioMetricsAnalyzer.MeasureLoudnessAndPeakOnly(new WaveAudioData(sampleRate, channels, 32, samples, "WAV Float"));
    }

    private static CleanupResult Cleanup(float[] source, int channels, MasteringSettings settings)
    {
        double repair = RepairMultiplier(settings.SourceRepair);
        double clipThreshold = settings.SourceRepair == "strong" ? 0.975 : settings.SourceRepair == "light" ? 0.992 : 0.985;
        double clickThreshold = settings.SourceRepair == "strong" ? 0.34 : settings.SourceRepair == "light" ? 0.52 : 0.42;
        float[] output = new float[source.Length];
        for (int index = 0; index < source.Length; index++)
            output[index] = double.IsFinite(source[index]) ? source[index] : 0f;

        int clipped = 0;
        int clicks = 0;
        int frames = output.Length / channels;
        for (int frame = 1; frame < frames - 1; frame++)
        {
            int offset = frame * channels;
            int previousOffset = (frame - 1) * channels;
            int nextOffset = (frame + 1) * channels;
            for (int channel = 0; channel < channels; channel++)
            {
                int index = offset + channel;
                double originalValue = output[index];
                double previous = output[previousOffset + channel];
                double next = output[nextOffset + channel];
                double abs = Math.Abs(originalValue);

                if (abs >= clipThreshold)
                {
                    clipped++;
                    double sign = Math.Sign(originalValue) == 0 ? 1 : Math.Sign(originalValue);
                    double overshoot = AudioDspPrimitives.Clamp((abs - clipThreshold) / Math.Max(0.006, 1 - clipThreshold), 0, 1);
                    double softCeiling = clipThreshold + 0.006 / repair;
                    output[index] = (float)(sign * (softCeiling + 0.004 * Math.Tanh(overshoot)));
                }

                double neighborAverage = (previous + next) * 0.5;
                double localJump = Math.Abs(originalValue - neighborAverage);
                double neighborDelta = Math.Abs(previous - next);
                if (localJump > clickThreshold && localJump > neighborDelta * (settings.SourceRepair == "strong" ? 2.6 : 3.2))
                {
                    output[index] = (float)neighborAverage;
                    clicks++;
                }
            }
        }
        return new CleanupResult(output, clipped, clicks);
    }

    private static ProcessingProfile GetProcessingProfile(MasteringSettings settings)
    {
        double amount = AudioDspPrimitives.Clamp(settings.Intensity / 100.0, 0, 1);
        bool youtube = settings.AutoIntensity == "youtube";
        double spaceFactor = settings.SpacePreserve || youtube ? 0.78 : 1;
        double repair = RepairMultiplier(settings.SourceRepair) * (settings.AntiFatigue ? 1.18 : 1) * (youtube ? 1.06 : 1);
        double highTreatment = settings.HighTreatment switch
        {
            "verySoft" => settings.AntiFatigue ? -5.2 : -4.1,
            "soft" => settings.AntiFatigue ? -3.5 : -2.7,
            "open" => 1.0,
            _ => -0.5
        };
        double presetWeight = youtube ? 0.92 : settings.Id == "smooth" ? 1.18 : settings.Id == "open" ? 0.65 : settings.Id == "balanced" ? 0.86 : settings.Id == "power" ? 0.78 : 1;
        double powerBoost = settings.Id == "power" ? 0.8 : 0;
        double fizz = settings.HighTreatment switch
        {
            "verySoft" => (settings.AntiFatigue ? -4.2 : -3.2) * amount * repair,
            "soft" => (settings.AntiFatigue ? -2.9 : -2.0) * amount * repair,
            "open" => -0.4 * amount * repair,
            _ => -1.0 * amount * repair
        };
        double dehissBase = settings.HighTreatment switch
        {
            "verySoft" => 2.2,
            "soft" => 1.35,
            "open" => 0.25,
            _ => 0.75
        };
        return new ProcessingProfile(
            highTreatment * amount * presetWeight,
            (settings.AntiFatigue ? -3.1 : -2.3) * amount * presetWeight * repair * spaceFactor,
            fizz,
            settings.HighTreatment == "open" ? 0.9 * amount : (settings.AntiFatigue ? -0.9 : -0.35) * amount,
            youtube ? (settings.AntiFatigue ? -0.35 : -0.15) * amount : settings.HighTreatment == "open" ? 0.65 * amount : (settings.AntiFatigue ? -0.75 : -0.45) * amount,
            youtube ? 0.08 * amount : settings.Id == "open" ? -0.35 * amount : 0.45 * amount + powerBoost,
            youtube ? 30 : settings.Id == "power" ? 30 : 34,
            -23 + 8 * (1 - amount) - settings.Density * 0.04 + (settings.SpacePreserve ? 1.4 : 0) + (youtube ? 0.9 : 0),
            (1.45 + 1.05 * amount + settings.Density * 0.012) * (settings.SpacePreserve ? 0.84 : 1) * (youtube ? 0.9 : 1),
            1 + 0.08 * amount + settings.Density * (settings.SpacePreserve || youtube ? 0.001 : 0.0018) + (settings.AutoIntensity == "impact" && !settings.SpacePreserve ? 0.035 : 0),
            dehissBase * repair + (settings.AntiFatigue ? 0.55 : 0) + (youtube ? 0.35 : 0));
    }

    private static BassPunchProfile GetBassPunchProfile(MasteringSettings settings, MasteringMetrics metrics)
    {
        if (!settings.BassPunch || settings.VocalPresence) return new BassPunchProfile(0, false, false);
        double presetFactor = settings.AutoIntensity switch
        {
            "safe" => 0.42,
            "balanced" => 0.62,
            "youtube" => 0.82,
            "impact" => 0.52,
            _ => 0.6
        };
        bool alreadyDense = metrics.LowRatio > 0.3 || metrics.SubRatio > 0.1;
        bool somewhatDense = metrics.LowRatio > 0.22 || metrics.SubRatio > 0.075;
        double safety = alreadyDense ? 0.55 : somewhatDense ? 0.75 : 1;
        double amount = AudioDspPrimitives.Clamp(presetFactor * safety, 0, 0.9);
        return new BassPunchProfile(amount, amount > 0, safety < 1);
    }

    private static double AnalyzeStereoRatio(float[] samples, int sampleRate, int channels)
    {
        if (channels < 2) return 0;
        double midSquare = 0;
        double sideSquare = 0;
        int frames = samples.Length / channels;
        int stride = Math.Max(1, (int)Math.Floor(sampleRate / 12000.0));
        int count = 0;
        for (int frame = 0; frame < frames; frame += stride)
        {
            int offset = frame * channels;
            double mid = (samples[offset] + samples[offset + 1]) * 0.5;
            double side = (samples[offset] - samples[offset + 1]) * 0.5;
            midSquare += mid * mid;
            sideSquare += side * side;
            count++;
        }
        double safeMid = Math.Max(midSquare / Math.Max(1, count), 1e-12);
        return Math.Sqrt((sideSquare / Math.Max(1, count)) / safeMid);
    }

    private static double PercentChange(double before, double after)
    {
        if (!double.IsFinite(before) || !double.IsFinite(after) || before <= 1e-9) return 0;
        return (after - before) / before * 100;
    }

    private static int JsRoundToInt(double value) => (int)Math.Floor(value + 0.5);

    private static double RepairMultiplier(string level) => level == "strong" ? 1.25 : level == "light" ? 0.72 : 1;
    private static string RepairLabel(string level) => level == "strong" ? "Forte" : level == "light" ? "Légère" : "Normale";

    private sealed record LoudnessPeakMeasurement(double IntegratedLufs, double PeakDb, double ApproxTruePeakDb);
    private sealed record YoutubeClampResult(float[] Output, double ClampGainDb, LoudnessPeakMetrics Metrics);
    private sealed record YoutubePeakPolishResult(float[] Output, double PeakLiftDb, double LoudnessTrimDb, LoudnessPeakMetrics Metrics);

    private sealed record ProcessingProfile(double HighShelfGain, double HarshDipGain, double FizzDipGain, double AirGain, double PresenceGain, double LowShelfGain, double SubControlFrequency, double CompressorThreshold, double CompressorRatio, double MakeupGain, double DehissReductionDb);
    private sealed record CleanupResult(float[] Samples, int ClippedSamples, int ClicksRepaired);
    private sealed record BassPunchProfile(double Amount, bool Active, bool SafeMode);
}

using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public readonly record struct LoudnessPeakMetrics(double PeakLinear, double PeakDb, double EstimatedLufs);

public static class AudioMetricsAnalyzer
{
    private const int FftSize = 2048;
    private const int MaxFrames = 72;

    public static MasteringMetrics Analyze(WaveAudioData audio)
    {
        int channels = Math.Max(1, audio.Channels);
        int frames = audio.Samples.Length / channels;
        double peak = 0;
        double sumSquares = 0;
        int clipping = 0;
        double leftSum = 0;
        double rightSum = 0;
        double sumLeft = 0;
        double sumRight = 0;
        double sumBoth = 0;

        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            for (int channel = 0; channel < channels; channel++)
            {
                double sample = double.IsFinite(audio.Samples[offset + channel]) ? audio.Samples[offset + channel] : 0;
                double abs = Math.Abs(sample);
                peak = Math.Max(peak, abs);
                sumSquares += sample * sample;
                if (abs >= 0.997) clipping++;
            }

            double left = double.IsFinite(audio.Samples[offset]) ? audio.Samples[offset] : 0;
            double right = channels > 1
                ? double.IsFinite(audio.Samples[offset + 1]) ? audio.Samples[offset + 1] : 0
                : left;
            leftSum += left * left;
            rightSum += right * right;
            sumLeft += left;
            sumRight += right;
            sumBoth += left * right;
        }

        double rms = Math.Sqrt(sumSquares / Math.Max(1, audio.Samples.Length));
        double peakDb = AudioDspPrimitives.LinearToDb(peak);
        double rmsDb = AudioDspPrimitives.LinearToDb(rms);
        SpectrumRatios spectrum = AverageSpectrum(audio);
        LoudnessResult loudness = EstimateIntegratedLoudness(audio);
        double approxTruePeak = peakDb + AudioDspPrimitives.Clamp(spectrum.HighTotalRatio * 1.4, 0.1, 0.9);
        double leftMean = sumLeft / Math.Max(1, frames);
        double rightMean = sumRight / Math.Max(1, frames);
        double covariance = sumBoth - frames * leftMean * rightMean;
        double varianceLeft = leftSum - frames * leftMean * leftMean;
        double varianceRight = rightSum - frames * rightMean * rightMean;
        double correlation = channels > 1
            ? AudioDspPrimitives.Clamp(covariance / Math.Sqrt(Math.Max(varianceLeft * varianceRight, 1e-18)), -1, 1)
            : 1;
        double leftRmsDb = AudioDspPrimitives.LinearToDb(Math.Sqrt(leftSum / Math.Max(1, frames)));
        double rightRmsDb = AudioDspPrimitives.LinearToDb(Math.Sqrt(rightSum / Math.Max(1, frames)));

        return new MasteringMetrics(
            peak,
            peakDb,
            rms,
            rmsDb,
            peakDb - rmsDb,
            frames / (double)Math.Max(1, audio.SampleRate),
            loudness.IntegratedLufs,
            loudness.ShortTermLufs,
            loudness.LoudnessRange,
            approxTruePeak,
            correlation,
            leftRmsDb - rightRmsDb,
            clipping,
            clipping / (double)Math.Max(1, audio.Samples.Length),
            Math.Min(rmsDb - 26, -58 + spectrum.HighTotalRatio * 14),
            spectrum.SubRatio,
            spectrum.LowRatio,
            spectrum.PresenceRatio,
            spectrum.BrightnessRatio,
            spectrum.FizzRatio,
            spectrum.UltraHighRatio,
            spectrum.HighTotalRatio,
            spectrum.SpectralCentroidHz);
    }

    public static LoudnessPeakMetrics MeasureLoudnessAndPeakOnly(WaveAudioData audio)
    {
        double peak = 0;
        foreach (float raw in audio.Samples)
        {
            double sample = double.IsFinite(raw) ? raw : 0;
            peak = Math.Max(peak, Math.Abs(sample));
        }

        LoudnessResult loudness = EstimateIntegratedLoudness(audio);
        double peakDb = AudioDspPrimitives.LinearToDb(peak);
        return new LoudnessPeakMetrics(peak, peakDb, loudness.IntegratedLufs);
    }

    private static SpectrumRatios AverageSpectrum(WaveAudioData audio)
    {
        int frames = audio.Samples.Length / Math.Max(1, audio.Channels);
        int frameCount = Math.Min(MaxFrames, Math.Max(1, frames / FftSize));
        var total = new SpectrumRatios();
        for (int frame = 0; frame < frameCount; frame++)
        {
            int usable = Math.Max(1, frames - FftSize);
            int start = frameCount <= 1 ? 0 : (int)Math.Floor(frame / (double)(frameCount - 1) * usable);
            SpectrumRatios current = AnalyzeSpectrumFrame(audio, start);
            total.SubRatio += current.SubRatio;
            total.LowRatio += current.LowRatio;
            total.PresenceRatio += current.PresenceRatio;
            total.BrightnessRatio += current.BrightnessRatio;
            total.FizzRatio += current.FizzRatio;
            total.UltraHighRatio += current.UltraHighRatio;
            total.HighTotalRatio += current.HighTotalRatio;
            total.SpectralCentroidHz += current.SpectralCentroidHz;
        }
        total.Divide(frameCount);
        return total;
    }

    private static SpectrumRatios AnalyzeSpectrumFrame(WaveAudioData audio, int startFrame)
    {
        double[] real = new double[FftSize];
        double[] imag = new double[FftSize];
        int channels = Math.Max(1, audio.Channels);
        int frames = audio.Samples.Length / channels;
        for (int index = 0; index < FftSize; index++)
        {
            int sourceFrame = Math.Min(Math.Max(0, frames - 1), startFrame + index);
            int offset = sourceFrame * channels;
            double mono = 0;
            for (int channel = 0; channel < channels; channel++) mono += audio.Samples[offset + channel];
            mono /= channels;
            double hann = 0.5 * (1 - Math.Cos(2 * Math.PI * index / Math.Max(1, FftSize - 1)));
            real[index] = mono * hann;
        }
        Fft(real, imag);

        double total = 1e-18;
        double sub = 0;
        double low = 0;
        double presence = 0;
        double brightness = 0;
        double fizz = 0;
        double ultra = 0;
        double centroid = 0;
        for (int bin = 1; bin < FftSize / 2; bin++)
        {
            double frequency = bin * audio.SampleRate / (double)FftSize;
            double magnitude = real[bin] * real[bin] + imag[bin] * imag[bin];
            total += magnitude;
            centroid += magnitude * frequency;
            if (frequency < 40) sub += magnitude;
            else if (frequency < 250) low += magnitude;
            else if (frequency >= 2000 && frequency < 5000) presence += magnitude;
            else if (frequency >= 5000 && frequency < 9000) brightness += magnitude;
            else if (frequency >= 9000 && frequency < 16000) fizz += magnitude;
            else if (frequency >= 16000 && frequency < 20000) ultra += magnitude;
        }

        return new SpectrumRatios
        {
            SubRatio = sub / total,
            LowRatio = low / total,
            PresenceRatio = presence / total,
            BrightnessRatio = brightness / total,
            FizzRatio = fizz / total,
            UltraHighRatio = ultra / total,
            HighTotalRatio = (presence + brightness + fizz + ultra) / total,
            SpectralCentroidHz = centroid / total
        };
    }

    private static LoudnessResult EstimateIntegratedLoudness(WaveAudioData audio)
    {
        int channels = Math.Max(1, audio.Channels);
        int frames = audio.Samples.Length / channels;
        if (frames == 0) return new LoudnessResult(-120, -120, 0);

        int hopSamples = Math.Max(1, JsRoundToInt(audio.SampleRate * 0.1));
        int chunkCount = Math.Max(1, (int)Math.Ceiling(frames / (double)hopSamples));
        double[] chunkEnergies = new double[chunkCount];
        int[] chunkSamples = new int[chunkCount];
        for (int chunk = 0; chunk < chunkCount; chunk++)
        {
            int start = chunk * hopSamples;
            int end = Math.Min(frames, start + hopSamples);
            chunkSamples[chunk] = Math.Max(0, end - start);
        }

        BiquadCoefficients pre = AudioDspPrimitives.HighShelf(audio.SampleRate, 1681.974450955533, 4);
        BiquadCoefficients rlb = AudioDspPrimitives.HighPassQ(audio.SampleRate, 38.13547087602444, 0.5003270373238773);
        var preFilter = new BiquadProcessor(pre, channels);
        var rlbFilter = new BiquadProcessor(rlb, channels);
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            int chunk = Math.Min(chunkCount - 1, frame / hopSamples);
            for (int channel = 0; channel < channels; channel++)
            {
                float weighted = rlbFilter.Process(preFilter.Process(audio.Samples[offset + channel], channel), channel);
                chunkEnergies[chunk] += weighted * weighted;
            }
        }

        int momentaryChunks = 4;
        int shortTermChunks = 30;
        List<double> momentaryEnergies = WindowEnergies(chunkEnergies, chunkSamples, momentaryChunks);
        double integrated = GatedIntegratedLoudness(momentaryEnergies);
        List<double> shortTermValues = WindowLoudness(chunkEnergies, chunkSamples, shortTermChunks);
        List<double> rangeValues = shortTermValues.Where(value => value > integrated - 20 && value > -70).ToList();
        if (rangeValues.Count == 0) rangeValues = shortTermValues;
        return new LoudnessResult(integrated, shortTermValues.Count > 0 ? shortTermValues.Max() : integrated, CalculateRange(rangeValues));
    }

    private static List<double> WindowEnergies(double[] energies, int[] samples, int window)
    {
        var result = new List<double>();
        int safe = Math.Max(1, Math.Min(window, energies.Length));
        int last = Math.Max(0, energies.Length - safe);
        for (int start = 0; start <= last; start++)
        {
            double energy = 0;
            int count = 0;
            for (int offset = 0; offset < safe; offset++)
            {
                energy += energies[start + offset];
                count += samples[start + offset];
            }
            if (count > 0) result.Add(energy / count);
        }
        return result;
    }

    private static List<double> WindowLoudness(double[] energies, int[] samples, int window)
    {
        return WindowEnergies(energies, samples, window).Select(LoudnessFromEnergy).Where(value => value > -70).ToList();
    }

    private static double GatedIntegratedLoudness(List<double> energies)
    {
        List<double> absolute = energies.Where(energy => LoudnessFromEnergy(energy) > -70).ToList();
        if (absolute.Count == 0) return -120;
        double mean = absolute.Average();
        double relativeGate = LoudnessFromEnergy(mean) - 10;
        List<double> relative = absolute.Where(energy => LoudnessFromEnergy(energy) > relativeGate).ToList();
        List<double> final = relative.Count > 0 ? relative : absolute;
        return LoudnessFromEnergy(final.Average());
    }

    private static double LoudnessFromEnergy(double energy) => -0.691 + 10 * Math.Log10(Math.Max(energy, 1e-18));

    private static double CalculateRange(List<double> values)
    {
        if (values.Count == 0) return 0;
        values.Sort();
        double low = values[Math.Min(values.Count - 1, (int)Math.Floor(values.Count * 0.1))];
        double high = values[Math.Min(values.Count - 1, (int)Math.Floor(values.Count * 0.9))];
        return Math.Max(0, high - low);
    }

    private static void Fft(double[] real, double[] imag)
    {
        int n = real.Length;
        int j = 0;
        for (int i = 1; i < n; i++)
        {
            int bit = n >> 1;
            while ((j & bit) != 0)
            {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
            if (i < j)
            {
                (real[i], real[j]) = (real[j], real[i]);
                (imag[i], imag[j]) = (imag[j], imag[i]);
            }
        }

        for (int length = 2; length <= n; length <<= 1)
        {
            double angle = -2 * Math.PI / length;
            double wLengthReal = Math.Cos(angle);
            double wLengthImag = Math.Sin(angle);
            for (int i = 0; i < n; i += length)
            {
                double wReal = 1;
                double wImag = 0;
                for (int k = 0; k < length / 2; k++)
                {
                    int even = i + k;
                    int odd = even + length / 2;
                    double oddReal = real[odd] * wReal - imag[odd] * wImag;
                    double oddImag = real[odd] * wImag + imag[odd] * wReal;
                    real[odd] = real[even] - oddReal;
                    imag[odd] = imag[even] - oddImag;
                    real[even] += oddReal;
                    imag[even] += oddImag;
                    double nextReal = wReal * wLengthReal - wImag * wLengthImag;
                    wImag = wReal * wLengthImag + wImag * wLengthReal;
                    wReal = nextReal;
                }
            }
        }
    }

    private static int JsRoundToInt(double value) => (int)Math.Floor(value + 0.5);

    private sealed class SpectrumRatios
    {
        public double SubRatio { get; set; }
        public double LowRatio { get; set; }
        public double PresenceRatio { get; set; }
        public double BrightnessRatio { get; set; }
        public double FizzRatio { get; set; }
        public double UltraHighRatio { get; set; }
        public double HighTotalRatio { get; set; }
        public double SpectralCentroidHz { get; set; }

        public void Divide(double value)
        {
            SubRatio /= value;
            LowRatio /= value;
            PresenceRatio /= value;
            BrightnessRatio /= value;
            FizzRatio /= value;
            UltraHighRatio /= value;
            HighTotalRatio /= value;
            SpectralCentroidHz /= value;
        }
    }

    private sealed record LoudnessResult(double IntegratedLufs, double ShortTermLufs, double LoudnessRange);
}

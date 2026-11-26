using System.Numerics;
using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public static class V6SourceAnalyzer
{
    private const int FftSize = 4096;
    private const int WindowSeconds = 6;
    private const int SpectralFramesPerWindow = 8;
    private const double Epsilon = 1e-20;

    public static V6SourceMetrics Analyze(WaveAudioData audio)
    {
        ArgumentNullException.ThrowIfNull(audio);
        if (audio.SampleRate <= 0 || audio.Channels <= 0 || audio.Samples.Length < audio.Channels)
        {
            return EmptyMetrics();
        }

        int totalFrames = audio.Samples.Length / audio.Channels;
        if (totalFrames <= 0) return EmptyMetrics();

        int windowFrames = Math.Max(FftSize, audio.SampleRate * WindowSeconds);
        var windows = new List<WindowStats>();
        for (int start = 0; start < totalFrames; start += windowFrames)
        {
            int count = Math.Min(windowFrames, totalFrames - start);
            if (count < Math.Min(FftSize, audio.SampleRate)) continue;
            windows.Add(MeasureWindow(audio, start, count));
        }

        if (windows.Count == 0)
        {
            windows.Add(MeasureWindow(audio, 0, totalFrames));
        }

        double activityReference = Percentile(windows.Select(item => item.RmsDb), .80);
        List<WindowStats> active = windows
            .Where(item => item.RmsDb >= activityReference - 18.0 && item.RmsDb > -62.0)
            .ToList();
        if (active.Count == 0)
        {
            active.Add(windows.OrderByDescending(item => item.RmsDb).First());
        }

        var spectral = new List<SpectralFrameMetrics>(active.Count * SpectralFramesPerWindow);
        foreach (WindowStats window in active)
        {
            AddSpectralFrames(audio, window, spectral);
        }

        if (spectral.Count == 0)
        {
            int usable = Math.Min(FftSize, totalFrames);
            if (usable >= 64)
            {
                spectral.Add(MeasureSpectralFrame(audio, Math.Max(0, (totalFrames - usable) / 2)));
            }
        }

        if (spectral.Count == 0) return EmptyMetrics() with { ActiveWindowCount = active.Count };

        double sibilanceTemporalCrest = Percentile(spectral.Select(item => item.SibilanceAbsoluteDb), .95)
            - Percentile(spectral.Select(item => item.SibilanceAbsoluteDb), .50);
        double fizzTemporalCrest = Percentile(spectral.Select(item => item.FizzAbsoluteDb), .95)
            - Percentile(spectral.Select(item => item.FizzAbsoluteDb), .50);

        return new V6SourceMetrics(
            active.Count,
            Median(active.Select(item => item.Correlation)),
            Median(active.Select(item => item.SideMidDb)),
            Median(spectral.Select(item => item.LowSideMidDb)),
            Median(spectral.Select(item => item.LowMidSideMidDb)),
            Median(spectral.Select(item => item.WidthLowSideMidDb)),
            Median(spectral.Select(item => item.VocalSideMidDb)),
            Median(spectral.Select(item => item.UpperPresenceSideMidDb)),
            Median(spectral.Select(item => item.SibilanceSideMidDb)),
            Median(spectral.Select(item => item.BoxRelativeDb)),
            Median(spectral.Select(item => item.VocalRelativeDb)),
            Median(spectral.Select(item => item.PresenceRelativeDb)),
            Median(spectral.Select(item => item.SibilanceRelativeDb)),
            Median(spectral.Select(item => item.FizzRelativeDb)),
            Math.Max(0, sibilanceTemporalCrest),
            Math.Max(0, fizzTemporalCrest),
            Median(spectral.Select(item => item.FizzFlatness)),
            Median(spectral.Select(item => item.SibilanceRelativeDb - item.PresenceRelativeDb)));
    }

    private static void AddSpectralFrames(WaveAudioData audio, WindowStats window, List<SpectralFrameMetrics> output)
    {
        int totalFrames = audio.Samples.Length / audio.Channels;
        int maxStart = Math.Max(window.StartFrame, window.StartFrame + window.FrameCount - FftSize);
        if (window.FrameCount <= FftSize)
        {
            output.Add(MeasureSpectralFrame(audio, Math.Min(window.StartFrame, Math.Max(0, totalFrames - FftSize))));
            return;
        }

        for (int index = 0; index < SpectralFramesPerWindow; index++)
        {
            double position = SpectralFramesPerWindow == 1 ? .5 : (index + .5) / SpectralFramesPerWindow;
            int start = window.StartFrame + (int)Math.Round((window.FrameCount - FftSize) * position);
            start = Math.Clamp(start, window.StartFrame, maxStart);
            start = Math.Min(start, Math.Max(0, totalFrames - FftSize));
            output.Add(MeasureSpectralFrame(audio, start));
        }
    }

    private static WindowStats MeasureWindow(WaveAudioData audio, int startFrame, int frameCount)
    {
        double midSquare = 0;
        double sideSquare = 0;
        double leftSquare = 0;
        double rightSquare = 0;
        double cross = 0;
        int end = Math.Min(startFrame + frameCount, audio.Samples.Length / audio.Channels);
        int measured = Math.Max(1, end - startFrame);

        for (int frame = startFrame; frame < end; frame++)
        {
            double left = audio.Samples[frame * audio.Channels];
            double right = audio.Channels > 1 ? audio.Samples[frame * audio.Channels + 1] : left;
            double mid = (left + right) * .5;
            double side = (left - right) * .5;
            midSquare += mid * mid;
            sideSquare += side * side;
            leftSquare += left * left;
            rightSquare += right * right;
            cross += left * right;
        }

        double midRms = Math.Sqrt(midSquare / measured);
        double sideRms = Math.Sqrt(sideSquare / measured);
        double corrDenominator = Math.Sqrt(leftSquare * rightSquare);
        double correlation = corrDenominator <= Epsilon ? 1 : Math.Clamp(cross / corrDenominator, -1, 1);
        return new WindowStats(
            startFrame,
            measured,
            ToDb(midRms),
            ToDbRatio(sideRms * sideRms, midRms * midRms),
            correlation);
    }

    private static SpectralFrameMetrics MeasureSpectralFrame(WaveAudioData audio, int startFrame)
    {
        var mid = new Complex[FftSize];
        var side = new Complex[FftSize];
        int totalFrames = audio.Samples.Length / audio.Channels;
        int available = Math.Max(0, Math.Min(FftSize, totalFrames - startFrame));

        for (int index = 0; index < FftSize; index++)
        {
            double sampleMid = 0;
            double sampleSide = 0;
            if (index < available)
            {
                int baseIndex = (startFrame + index) * audio.Channels;
                double left = audio.Samples[baseIndex];
                double right = audio.Channels > 1 ? audio.Samples[baseIndex + 1] : left;
                sampleMid = (left + right) * .5;
                sampleSide = (left - right) * .5;
            }

            double hann = .5 - .5 * Math.Cos(2 * Math.PI * index / (FftSize - 1));
            mid[index] = new Complex(sampleMid * hann, 0);
            side[index] = new Complex(sampleSide * hann, 0);
        }

        FftInPlace(mid);
        FftInPlace(side);

        double totalMid = BandPower(mid, audio.SampleRate, 20, Math.Min(20000, audio.SampleRate * .49));
        double lowMid = BandPower(mid, audio.SampleRate, 20, 120);
        double lowSide = BandPower(side, audio.SampleRate, 20, 120);
        double lowMidMid = BandPower(mid, audio.SampleRate, 120, 700);
        double lowMidSide = BandPower(side, audio.SampleRate, 120, 700);
        double widthMid = BandPower(mid, audio.SampleRate, 700, 1500);
        double widthSide = BandPower(side, audio.SampleRate, 700, 1500);
        double vocalMid = BandPower(mid, audio.SampleRate, 1500, 4000);
        double vocalSide = BandPower(side, audio.SampleRate, 1500, 4000);
        double upperMid = BandPower(mid, audio.SampleRate, 4000, 6000);
        double upperSide = BandPower(side, audio.SampleRate, 4000, 6000);
        double sibilanceSide = BandPower(side, audio.SampleRate, 6000, 9000);
        double sibilanceMidForSide = BandPower(mid, audio.SampleRate, 6000, 9000);
        double boxMid = BandPower(mid, audio.SampleRate, 500, 1000);
        double presenceMid = BandPower(mid, audio.SampleRate, 2000, 6000);
        double sibilanceMid = BandPower(mid, audio.SampleRate, 5000, 9000);
        double fizzMid = BandPower(mid, audio.SampleRate, 8000, 16000);
        double fizzSide = BandPower(side, audio.SampleRate, 8000, 16000);
        double fizzFlatness = SpectralFlatness(mid, side, audio.SampleRate, 8000, 16000);

        return new SpectralFrameMetrics(
            ToDbRatio(lowSide, lowMid),
            ToDbRatio(lowMidSide, lowMidMid),
            ToDbRatio(widthSide, widthMid),
            ToDbRatio(vocalSide, vocalMid),
            ToDbRatio(upperSide, upperMid),
            ToDbRatio(sibilanceSide, sibilanceMidForSide),
            ToDbRatio(boxMid, totalMid),
            ToDbRatio(vocalMid, totalMid),
            ToDbRatio(presenceMid, totalMid),
            ToDbRatio(sibilanceMid, totalMid),
            ToDbRatio(fizzMid + fizzSide, totalMid),
            ToDb(Math.Sqrt(Math.Max(Epsilon, sibilanceMid))),
            ToDb(Math.Sqrt(Math.Max(Epsilon, fizzMid + fizzSide))),
            fizzFlatness);
    }

    private static double BandPower(Complex[] spectrum, int sampleRate, double lowHz, double highHz)
    {
        if (highHz <= lowHz) return Epsilon;
        int maxBin = spectrum.Length / 2;
        int lowBin = Math.Max(1, (int)Math.Ceiling(lowHz * spectrum.Length / sampleRate));
        int highBin = Math.Min(maxBin, (int)Math.Floor(highHz * spectrum.Length / sampleRate));
        double sum = 0;
        for (int bin = lowBin; bin <= highBin; bin++)
        {
            double magnitude = spectrum[bin].Magnitude;
            sum += magnitude * magnitude;
        }
        return Math.Max(Epsilon, sum);
    }

    private static double SpectralFlatness(Complex[] mid, Complex[] side, int sampleRate, double lowHz, double highHz)
    {
        int maxBin = mid.Length / 2;
        int lowBin = Math.Max(1, (int)Math.Ceiling(lowHz * mid.Length / sampleRate));
        int highBin = Math.Min(maxBin, (int)Math.Floor(highHz * mid.Length / sampleRate));
        if (highBin < lowBin) return 0;

        double logSum = 0;
        double arithmetic = 0;
        int count = 0;
        for (int bin = lowBin; bin <= highBin; bin++)
        {
            double value = mid[bin].Magnitude * mid[bin].Magnitude + side[bin].Magnitude * side[bin].Magnitude + Epsilon;
            logSum += Math.Log(value);
            arithmetic += value;
            count++;
        }
        if (count == 0 || arithmetic <= Epsilon) return 0;
        double geometric = Math.Exp(logSum / count);
        return Math.Clamp(geometric / (arithmetic / count), 0, 1);
    }

    private static void FftInPlace(Complex[] buffer)
    {
        int n = buffer.Length;
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
            if (i < j) (buffer[i], buffer[j]) = (buffer[j], buffer[i]);
        }

        for (int length = 2; length <= n; length <<= 1)
        {
            double angle = -2 * Math.PI / length;
            Complex step = new(Math.Cos(angle), Math.Sin(angle));
            for (int offset = 0; offset < n; offset += length)
            {
                Complex w = Complex.One;
                int half = length >> 1;
                for (int index = 0; index < half; index++)
                {
                    Complex even = buffer[offset + index];
                    Complex odd = buffer[offset + index + half] * w;
                    buffer[offset + index] = even + odd;
                    buffer[offset + index + half] = even - odd;
                    w *= step;
                }
            }
        }
    }

    private static double Median(IEnumerable<double> values) => Percentile(values, .50);

    private static double Percentile(IEnumerable<double> values, double percentile)
    {
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

    private static double ToDb(double linear) => linear <= 1e-12 ? -120 : 20 * Math.Log10(linear);
    private static double ToDbRatio(double numerator, double denominator) => 10 * Math.Log10((numerator + Epsilon) / (denominator + Epsilon));

    private static V6SourceMetrics EmptyMetrics() => new(
        0, 1, -120, -120, -120, -120, -120, -120, -120,
        -120, -120, -120, -120, -120, 0, 0, 0, 0);

    private sealed record WindowStats(int StartFrame, int FrameCount, double RmsDb, double SideMidDb, double Correlation);

    private readonly record struct SpectralFrameMetrics(
        double LowSideMidDb,
        double LowMidSideMidDb,
        double WidthLowSideMidDb,
        double VocalSideMidDb,
        double UpperPresenceSideMidDb,
        double SibilanceSideMidDb,
        double BoxRelativeDb,
        double VocalRelativeDb,
        double PresenceRelativeDb,
        double SibilanceRelativeDb,
        double FizzRelativeDb,
        double SibilanceAbsoluteDb,
        double FizzAbsoluteDb,
        double FizzFlatness);
}

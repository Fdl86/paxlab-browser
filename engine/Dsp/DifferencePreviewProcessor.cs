using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

// Analysis-only monitor: this signal is NEVER fed to the mastering or export pipeline.
// It is the waveform difference after a global gain match and temporal alignment,
// not an extracted denoiser "noise" stem.
public sealed record DifferencePreviewData(
    WaveAudioData Audio,
    int DelayFrames,
    double MatchGainDb,
    double PreviewGainDb);

public static class DifferencePreviewProcessor
{
    public static DifferencePreviewData Build(WaveAudioData original, WaveAudioData mastered)
    {
        ArgumentNullException.ThrowIfNull(original);
        ArgumentNullException.ThrowIfNull(mastered);
        if (original.SampleRate != mastered.SampleRate || original.Channels != mastered.Channels ||
            original.Channels is < 1 or > 2 || original.SampleRate < 8000 ||
            original.Samples.Length % original.Channels != 0 ||
            mastered.Samples.Length % mastered.Channels != 0)
            throw new NotSupportedException("La comparaison nécessite deux signaux de même fréquence et du même nombre de canaux.");

        int channels = original.Channels;
        int inputFrames = original.Samples.Length / channels;
        int outputFrames = mastered.Samples.Length / channels;
        int commonFrames = Math.Min(inputFrames, outputFrames);
        if (commonFrames < original.SampleRate / 4)
            throw new ArgumentException("Audio insuffisant pour analyser le signal de différence.");

        int lag = FindDelay(original.Samples, mastered.Samples, original.SampleRate, channels, commonFrames);
        // Single, global RMS gain match. No EQ, denoising, stereo remix or compression.
        double originalEnergy = 0, renderEnergy = 0;
        long count = 0;
        int stride = Math.Max(1, original.SampleRate / 8000);
        for (int frame = Math.Max(0, -lag); frame < Math.Min(inputFrames, outputFrames - lag); frame += stride)
        {
            int a = frame * channels, b = (frame + lag) * channels;
            for (int channel = 0; channel < channels; channel++)
            {
                double left = Safe(original.Samples[a + channel]);
                double right = Safe(mastered.Samples[b + channel]);
                originalEnergy += left * left;
                renderEnergy += right * right;
                count++;
            }
        }
        double matchGain = renderEnergy > 1e-14 && count > 0
            ? Math.Clamp(Math.Sqrt(originalEnergy / renderEnergy), .25, 4.0) : 1;

        // Keep source duration/timebase, silence only the non-overlapping boundary.
        // One float array for the preview. Neither supplied buffer is changed.
        var residual = new float[original.Samples.Length];
        double maxAbs = 0;
        for (int frame = 0; frame < inputFrames; frame++)
        {
            int renderFrame = frame + lag;
            if (renderFrame < 0 || renderFrame >= outputFrames) continue;
            int sourceIndex = frame * channels;
            int renderIndex = renderFrame * channels;
            for (int c = 0; c < channels; c++)
            {
                double v = Safe(original.Samples[sourceIndex + c]) -
                    matchGain * Safe(mastered.Samples[renderIndex + c]);
                residual[sourceIndex + c] = (float)v;
                maxAbs = Math.Max(maxAbs, Math.Abs(v));
            }
        }

        // Independent listening gain only. Maximum +18 dB and peak at -8 dBFS.
        // This amplification is deliberate: the difference can be very quiet.
        double previewGain = maxAbs > 1e-12
            ? Math.Min(Math.Pow(10, 18.0 / 20.0), .398 / maxAbs) : 1;
        for (int i = 0; i < residual.Length; i++)
            residual[i] = (float)(residual[i] * previewGain);

        return new DifferencePreviewData(
            original with { Samples = residual, SourceFormat = "PAXLAB Difference Preview" },
            lag,
            20 * Math.Log10(matchGain),
            20 * Math.Log10(previewGain));
    }

    // Search a +-20 ms delay without modifying either input signal.
    // Three windows are tested; the energetic window is selected to avoid silence.
    private static int FindDelay(float[] source, float[] render, int rate, int channels, int frames)
    {
        int searchRadius = Math.Min(rate / 50, frames / 8);
        int window = Math.Min(rate, frames / 6);
        if (searchRadius < 1 || window < 256) return 0;
        int start = searchRadius;
        double highestEnergy = double.NegativeInfinity;
        foreach (double fraction in new[] { .18, .43, .68 })
        {
            int candidate = Math.Clamp((int)(frames * fraction), searchRadius,
                frames - window - searchRadius);
            double energy = 0;
            for (int f = candidate; f < candidate + window; f += 32)
            {
                double v = Safe(source[f * channels]);
                energy += v * v;
            }
            if (energy > highestEnergy)
            {
                start = candidate;
                highestEnergy = energy;
            }
        }
        if (highestEnergy < 1e-12) return 0;

        int best = 0;
        double bestScore = double.NegativeInfinity;
        for (int shift = -searchRadius; shift <= searchRadius; shift += 4)
        {
            double score = Score(source, render, channels, start, window, shift);
            if (score > bestScore) { best = shift; bestScore = score; }
        }
        int coarse = best;
        for (int shift = Math.Max(-searchRadius, coarse - 4);
             shift <= Math.Min(searchRadius, coarse + 4); shift++)
        {
            double score = Score(source, render, channels, start, window, shift);
            if (score > bestScore) { best = shift; bestScore = score; }
        }
        return best;
    }

    private static double Score(float[] a, float[] b, int channels, int start, int window, int delay)
    {
        double sum = 0;
        for (int frame = start; frame < start + window; frame += 16)
        {
            int sourceIndex = frame * channels;
            int renderIndex = (frame + delay) * channels;
            for (int c = 0; c < channels; c++)
                sum += Safe(a[sourceIndex + c]) * Safe(b[renderIndex + c]);
        }
        return sum;
    }

    private static double Safe(float value) => float.IsFinite(value) ? value : 0;
}

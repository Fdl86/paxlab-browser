using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public static class V6TruePeakGuard
{
    private static readonly double[][] PhaseCoefficients = BuildPhaseCoefficients();

    public static V6TruePeakGuardResult Apply(WaveAudioData source, double ceilingDb)
    {
        ArgumentNullException.ThrowIfNull(source);
        double truePeak = Measure4x(source);
        if (truePeak <= ceilingDb + .01)
        {
            return new V6TruePeakGuardResult(source, truePeak, truePeak, 0, false);
        }

        double reductionDb = truePeak - ceilingDb + .03;
        double gain = Math.Pow(10, -reductionDb / 20);
        float[] samples = (float[])source.Samples.Clone();
        for (int index = 0; index < samples.Length; index++) samples[index] = (float)(samples[index] * gain);
        var audio = new WaveAudioData(source.SampleRate, source.Channels, source.BitsPerSample, samples, source.SourceFormat);
        return new V6TruePeakGuardResult(audio, truePeak, truePeak - reductionDb, reductionDb, true);
    }

    public static double Measure4x(WaveAudioData audio)
    {
        ArgumentNullException.ThrowIfNull(audio);
        if (audio.Samples.Length == 0 || audio.Channels <= 0) return -120;

        double samplePeak = 0;
        foreach (float sample in audio.Samples) samplePeak = Math.Max(samplePeak, Math.Abs(sample));
        if (samplePeak <= 1e-12) return -120;

        double max = samplePeak;
        double candidateThreshold = samplePeak * .55;
        int frames = audio.Samples.Length / audio.Channels;
        for (int channel = 0; channel < audio.Channels; channel++)
        {
            for (int frame = 0; frame < frames - 1; frame++)
            {
                double current = Math.Abs(audio.Samples[frame * audio.Channels + channel]);
                double next = Math.Abs(audio.Samples[(frame + 1) * audio.Channels + channel]);
                if (Math.Max(current, next) < candidateThreshold) continue;

                foreach (double[] coefficients in PhaseCoefficients)
                {
                    double interpolated = 0;
                    for (int tap = 0; tap < coefficients.Length; tap++)
                    {
                        int sourceFrame = Math.Clamp(frame + tap - 3, 0, frames - 1);
                        interpolated += audio.Samples[sourceFrame * audio.Channels + channel] * coefficients[tap];
                    }
                    max = Math.Max(max, Math.Abs(interpolated));
                }
            }
        }
        return 20 * Math.Log10(Math.Max(1e-12, max));
    }

    private static double[][] BuildPhaseCoefficients()
    {
        double[] phases = [.25, .50, .75];
        var result = new double[phases.Length][];
        for (int phaseIndex = 0; phaseIndex < phases.Length; phaseIndex++)
        {
            double phase = phases[phaseIndex];
            var coefficients = new double[8];
            double sum = 0;
            for (int tap = 0; tap < coefficients.Length; tap++)
            {
                int k = tap - 3;
                double x = phase - k;
                double sinc = Math.Abs(x) < 1e-12 ? 1 : Math.Sin(Math.PI * x) / (Math.PI * x);
                double normalized = x / 4.0;
                double window = Math.Abs(normalized) >= 1
                    ? 0
                    : .42 + .5 * Math.Cos(Math.PI * normalized) + .08 * Math.Cos(2 * Math.PI * normalized);
                coefficients[tap] = sinc * window;
                sum += coefficients[tap];
            }

            if (Math.Abs(sum) > 1e-12)
            {
                for (int tap = 0; tap < coefficients.Length; tap++) coefficients[tap] /= sum;
            }
            result[phaseIndex] = coefficients;
        }
        return result;
    }
}

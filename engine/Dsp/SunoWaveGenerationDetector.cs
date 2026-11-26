using System.Buffers;
using System.Buffers.Binary;
using System.IO;


namespace Paxlab.Studio.App.Services;

/// <summary>
/// Experimental, read-only acoustic indication for original 48 kHz stereo PCM16 WAV exports.
/// It must never select a mastering DSP or be presented as a verified Suno model signature.
/// Reproduces the PAXLAB LAB 33-WAV research protocol (12 excerpts / Welch PSD / median).
/// </summary>
internal static class SunoWaveGenerationDetector
{
    private const int SampleRate = 48000;
    private const int BytesPerFrame = 4; // PCM16 stereo
    private const int ExcerptSeconds = 5;
    private const int ExcerptFrames = SampleRate * ExcerptSeconds;
    private const int Excerpts = 12;
    private const int FftSize = 8192;
    private const int HopSize = FftSize / 2;
    private const double V6EdgeDb = -3.0; // Exploratory, not population-calibrated
    private const double V55EdgeDb = -2.0;

    private static readonly double[] Hann = BuildHann();
    private static readonly int[] ReverseBits = BuildReverseBits();
    private static readonly double[] TwiddleCos = BuildTwiddles(cosine: true);
    private static readonly double[] TwiddleSin = BuildTwiddles(cosine: false);

    public static SunoWaveGenerationResult Analyze(byte[] sourcePcm, CancellationToken cancellationToken = default)
    {
        if (sourcePcm.Length % BytesPerFrame != 0) return Unknown("Invalid PCM");
        try
        {
            long frames = sourcePcm.Length / BytesPerFrame;
            if (frames < SampleRate * 20L)
                return Unknown("Durée inférieure à 20 secondes : analyse non étalonnée.");

            byte[] pcm = ArrayPool<byte>.Shared.Rent(ExcerptFrames * BytesPerFrame);
            float[] mid = ArrayPool<float>.Shared.Rent(ExcerptFrames);
            var real = new double[FftSize];
            var imaginary = new double[FftSize];
            var excerptDb = new double[Excerpts];
            int valid = 0;
            try
            {
                for (int excerpt = 0; excerpt < Excerpts; excerpt++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    double relativePosition = .12 + (.85 - .12) * excerpt / (Excerpts - 1);
                    long firstFrame = (long)(relativePosition * frames);
                    int received = (int)Math.Min(ExcerptFrames, frames - firstFrame) * BytesPerFrame;
                    Buffer.BlockCopy(sourcePcm, (int)(firstFrame * BytesPerFrame), pcm, 0, received);

                    int monoFrames = received / BytesPerFrame;
                    if (monoFrames < FftSize) continue;
                    for (int i = 0, offset = 0; i < monoFrames; i++, offset += BytesPerFrame)
                    {
                        short left = BinaryPrimitives.ReadInt16LittleEndian(pcm.AsSpan(offset, 2));
                        short right = BinaryPrimitives.ReadInt16LittleEndian(pcm.AsSpan(offset + 2, 2));
                        mid[i] = (left + right) / 65536f; // (L + R) / 2, PCM16 => [-1, 1)
                    }

                    double lowEnergy = 0, highEnergy = 0;
                    int windows = 0;
                    for (int start = 0; start + FftSize <= monoFrames; start += HopSize)
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        for (int i = 0; i < FftSize; i++)
                        {
                            real[i] = mid[start + i] * Hann[i];
                            imaginary[i] = 0;
                        }
                        Transform(real, imaginary);
                        // Welch PSD's common normalization, one-sided doubling and window
                        // mean cancel in this ratio. Accumulate the same bins over all windows.
                        for (int bin = 0; bin <= FftSize / 2; bin++)
                        {
                            long scaledHz = (long)bin * SampleRate;
                            if (scaledHz < 12000L * FftSize || scaledHz >= 16000L * FftSize) continue;
                            double energy = real[bin] * real[bin] + imaginary[bin] * imaginary[bin];
                            if (scaledHz < 14000L * FftSize) lowEnergy += energy;
                            else highEnergy += energy;
                        }
                        windows++;
                    }
                    // The factor 'windows' also cancels between the two bands.
                    double minimumRawEnergy = 1e-20 * SampleRate * (3.0 * FftSize / 8) * windows / 2;
                    if (windows == 0 || lowEnergy <= minimumRawEnergy || highEnergy <= minimumRawEnergy) continue;
                    excerptDb[valid++] = 10.0 * Math.Log10(highEnergy / lowEnergy);
                }
            }
            finally
            {
                ArrayPool<byte>.Shared.Return(pcm);
                ArrayPool<float>.Shared.Return(mid);
            }

            if (valid != Excerpts)
                return Unknown("Énergie dans les aigus insuffisante ou extraits indisponibles.", valid);

            Array.Sort(excerptDb);
            double median = (excerptDb[Excerpts / 2 - 1] + excerptDb[Excerpts / 2]) / 2;
            SunoWaveGenerationVerdict verdict = median < V6EdgeDb
                ? SunoWaveGenerationVerdict.V6Probable
                : median > V55EdgeDb
                    ? SunoWaveGenerationVerdict.V55Probable
                    : SunoWaveGenerationVerdict.Indeterminate;
            int supporting = 0;
            foreach (double value in excerptDb)
            {
                if (verdict == SunoWaveGenerationVerdict.V6Probable && value < V6EdgeDb ||
                    verdict == SunoWaveGenerationVerdict.V55Probable && value > V55EdgeDb ||
                    verdict == SunoWaveGenerationVerdict.Indeterminate && value >= V6EdgeDb && value <= V55EdgeDb)
                    supporting++;
            }
            return new SunoWaveGenerationResult(verdict, median, supporting, valid,
                "Indice acoustique expérimental. L'égalisation des aigus peut changer le résultat.");
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or InvalidDataException or ArgumentException or NotSupportedException)
        {
            return Unknown("Analyse WAV impossible : " + ex.Message);
        }
    }

    private static SunoWaveGenerationResult Unknown(string message, int segments = 0)
        => new(SunoWaveGenerationVerdict.Indeterminate, null, 0, segments, message);

    private static double[] BuildHann()
    {
        var result = new double[FftSize];
        for (int i = 0; i < FftSize; i++)
            result[i] = 0.5 - 0.5 * Math.Cos(2 * Math.PI * i / FftSize);
        return result;
    }

    private static int[] BuildReverseBits()
    {
        var result = new int[FftSize];
        int bits = 0;
        for (int i = FftSize; i > 1; i >>= 1) bits++;
        for (int i = 0; i < FftSize; i++)
        {
            int input = i, reversed = 0;
            for (int j = 0; j < bits; j++)
            {
                reversed = (reversed << 1) | (input & 1);
                input >>= 1;
            }
            result[i] = reversed;
        }
        return result;
    }

    private static double[] BuildTwiddles(bool cosine)
    {
        var values = new double[FftSize / 2];
        for (int i = 0; i < values.Length; i++)
        {
            double angle = -2 * Math.PI * i / FftSize;
            values[i] = cosine ? Math.Cos(angle) : Math.Sin(angle);
        }
        return values;
    }

    private static void Transform(double[] real, double[] imaginary)
    {
        for (int i = 0; i < FftSize; i++)
        {
            int j = ReverseBits[i];
            if (j <= i) continue;
            (real[i], real[j]) = (real[j], real[i]);
            (imaginary[i], imaginary[j]) = (imaginary[j], imaginary[i]);
        }
        for (int size = 2; size <= FftSize; size <<= 1)
        {
            int half = size / 2, twiddleStride = FftSize / size;
            for (int block = 0; block < FftSize; block += size)
            {
                for (int i = 0; i < half; i++)
                {
                    int low = block + i, high = low + half, tw = i * twiddleStride;
                    double cosine = TwiddleCos[tw], sine = TwiddleSin[tw];
                    double highReal = real[high] * cosine - imaginary[high] * sine;
                    double highImaginary = real[high] * sine + imaginary[high] * cosine;
                    double lowReal = real[low], lowImaginary = imaginary[low];
                    real[low] = lowReal + highReal;
                    imaginary[low] = lowImaginary + highImaginary;
                    real[high] = lowReal - highReal;
                    imaginary[high] = lowImaginary - highImaginary;
                }
            }
        }
    }
}

internal enum SunoWaveGenerationVerdict
{
    Indeterminate,
    V55Probable,
    V6Probable
}

internal sealed record SunoWaveGenerationResult(
    SunoWaveGenerationVerdict Verdict,
    double? HighFrequencySlopeDb,
    int SupportingExcerpts,
    int ExcerptCount,
    string Explanation)
{
    public string Label => Verdict switch
    {
        SunoWaveGenerationVerdict.V55Probable => "V5.5 probable",
        SunoWaveGenerationVerdict.V6Probable => "V6 probable",
        _ => "Indéterminé"
    };
}

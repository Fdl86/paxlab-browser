namespace Paxlab.Studio.App.Services;

internal readonly record struct BiquadCoefficients(double B0, double B1, double B2, double A1, double A2);

internal sealed class BiquadProcessor
{
    private readonly BiquadCoefficients _c;
    private readonly double[] _x1;
    private readonly double[] _x2;
    private readonly double[] _y1;
    private readonly double[] _y2;

    public BiquadProcessor(BiquadCoefficients coefficients, int channels)
    {
        _c = coefficients;
        int safeChannels = Math.Max(1, channels);
        _x1 = new double[safeChannels];
        _x2 = new double[safeChannels];
        _y1 = new double[safeChannels];
        _y2 = new double[safeChannels];
    }

    public float Process(float input, int channel)
    {
        double output = _c.B0 * input + _c.B1 * _x1[channel] + _c.B2 * _x2[channel] - _c.A1 * _y1[channel] - _c.A2 * _y2[channel];
        _x2[channel] = _x1[channel];
        _x1[channel] = input;
        _y2[channel] = _y1[channel];
        _y1[channel] = output;
        return double.IsFinite(output) ? (float)output : 0f;
    }
}

internal sealed class ZeroPoleProcessor
{
    private readonly float _zero;
    private readonly float _pole;
    private readonly float _zeroScale;
    private readonly float _poleScale;
    private float _lastInput;
    private float _lastOutput;

    public ZeroPoleProcessor(float zero, float pole)
    {
        _zero = zero;
        _pole = pole;
        _zeroScale = 1f / Math.Max(1e-9f, 1f - zero);
        _poleScale = 1f - pole;
    }

    public float Process(float input)
    {
        float first = _zeroScale * (input - _zero * _lastInput);
        float output = _poleScale * first + _pole * _lastOutput;
        _lastInput = input;
        _lastOutput = float.IsFinite(output) ? output : 0f;
        return _lastOutput;
    }
}

internal static class AudioDspPrimitives
{
    private const int WebAudioCompressorDelayBufferFrames = 1024;
    private const int WebAudioCompressorDelayMask = WebAudioCompressorDelayBufferFrames - 1;
    private const int WebAudioCompressorDivisionFrames = 32;
    private const float WebAudioCompressorPreDelaySeconds = 0.006f;
    private const float WebAudioCompressorReleaseZone1 = 0.09f;
    private const float WebAudioCompressorReleaseZone2 = 0.16f;
    private const float WebAudioCompressorReleaseZone3 = 0.42f;
    private const float WebAudioCompressorReleaseZone4 = 0.98f;
    private const float WebAudioCompressorFilterStageGainDb = 4.4f;
    private const float WebAudioCompressorFilterStageRatio = 2f;
    private const float WebAudioCompressorAnchorFrequency = 15000f;

    public static double Clamp(double value, double min, double max) => Math.Max(min, Math.Min(max, value));
    public static float Clamp(float value, float min, float max) => Math.Max(min, Math.Min(max, value));
    public static double DbToLinear(double db) => Math.Pow(10, db / 20.0);
    public static double LinearToDb(double linear) => linear <= 1e-12 ? -120 : 20.0 * Math.Log10(linear);

    public static BiquadCoefficients HighPass(int sampleRate, double frequency, double resonanceDb)
    {
        // Firefox Web Audio Biquad::setHighpassParams interprets Q as resonance in dB.
        double normalizedFrequency = Clamp(frequency / (sampleRate * 0.5), 0, 1);
        if (normalizedFrequency <= 0) return new BiquadCoefficients(1, 0, 0, 0, 0);
        if (normalizedFrequency >= 1) return new BiquadCoefficients(0, 0, 0, 0, 0);

        double g = Math.Pow(10, -0.05 * resonanceDb);
        double w0 = Math.PI * normalizedFrequency;
        double cos = Math.Cos(w0);
        double alpha = 0.5 * Math.Sin(w0) * g;
        double b1 = -1 - cos;
        double b0 = -0.5 * b1;
        double b2 = b0;
        return Normalize(b0, b1, b2, 1 + alpha, -2 * cos, 1 - alpha);
    }

    public static BiquadCoefficients HighPassQ(int sampleRate, double frequency, double q)
    {
        // RC6 K-weighted RLB filter: RBJ high-pass with a linear Q value.
        // Do not replace this with HighPass(), whose third argument intentionally
        // follows Firefox Web Audio's resonance-in-dB interpretation.
        double safeQ = Math.Max(q, 1e-9);
        double omega = 2 * Math.PI * frequency / sampleRate;
        double cos = Math.Cos(omega);
        double sin = Math.Sin(omega);
        double alpha = sin / (2 * safeQ);

        double b0 = (1 + cos) / 2;
        double b1 = -(1 + cos);
        double b2 = (1 + cos) / 2;
        double a0 = 1 + alpha;
        double a1 = -2 * cos;
        double a2 = 1 - alpha;

        return Normalize(b0, b1, b2, a0, a1, a2);
    }

    public static BiquadCoefficients LowShelf(int sampleRate, double frequency, double gainDb)
    {
        double a = Math.Pow(10, gainDb / 40.0);
        double omega = 2 * Math.PI * frequency / sampleRate;
        double cos = Math.Cos(omega);
        double sin = Math.Sin(omega);
        double sqrtA = Math.Sqrt(a);
        double alpha = sin / 2 * Math.Sqrt(2);
        double b0 = a * ((a + 1) - (a - 1) * cos + 2 * sqrtA * alpha);
        double b1 = 2 * a * ((a - 1) - (a + 1) * cos);
        double b2 = a * ((a + 1) - (a - 1) * cos - 2 * sqrtA * alpha);
        double a0 = (a + 1) + (a - 1) * cos + 2 * sqrtA * alpha;
        double a1 = -2 * ((a - 1) + (a + 1) * cos);
        double a2 = (a + 1) + (a - 1) * cos - 2 * sqrtA * alpha;
        return Normalize(b0, b1, b2, a0, a1, a2);
    }

    public static BiquadCoefficients HighShelf(int sampleRate, double frequency, double gainDb)
    {
        double a = Math.Pow(10, gainDb / 40.0);
        double omega = 2 * Math.PI * frequency / sampleRate;
        double cos = Math.Cos(omega);
        double sin = Math.Sin(omega);
        double sqrtA = Math.Sqrt(a);
        double alpha = sin / 2 * Math.Sqrt(2);
        double b0 = a * ((a + 1) + (a - 1) * cos + 2 * sqrtA * alpha);
        double b1 = -2 * a * ((a - 1) + (a + 1) * cos);
        double b2 = a * ((a + 1) + (a - 1) * cos - 2 * sqrtA * alpha);
        double a0 = (a + 1) - (a - 1) * cos + 2 * sqrtA * alpha;
        double a1 = 2 * ((a - 1) - (a + 1) * cos);
        double a2 = (a + 1) - (a - 1) * cos - 2 * sqrtA * alpha;
        return Normalize(b0, b1, b2, a0, a1, a2);
    }

    public static BiquadCoefficients Peaking(int sampleRate, double frequency, double q, double gainDb)
    {
        double a = Math.Pow(10, gainDb / 40.0);
        double omega = 2 * Math.PI * frequency / sampleRate;
        double cos = Math.Cos(omega);
        double sin = Math.Sin(omega);
        double alpha = sin / (2 * q);
        return Normalize(1 + alpha * a, -2 * cos, 1 - alpha * a, 1 + alpha / a, -2 * cos, 1 - alpha / a);
    }

    public static float[] ApplyBiquadChain(float[] source, int channels, params BiquadCoefficients[] coefficients)
    {
        float[] output = source.ToArray();
        ApplyBiquadChainInPlace(output, channels, coefficients);
        return output;
    }

    internal static void ApplyBiquadChainInPlace(float[] samples, int channels, params BiquadCoefficients[] coefficients)
    {
        foreach (BiquadCoefficients coefficient in coefficients)
        {
            var processor = new BiquadProcessor(coefficient, channels);
            int channel = 0;
            for (int index = 0; index < samples.Length; index++)
            {
                samples[index] = processor.Process(samples[index], channel);
                channel++;
                if (channel == channels) channel = 0;
            }
        }
    }

    public static float[] ApplyFirefoxWebAudioCompressor(
        float[] source,
        int sampleRate,
        int channels,
        double thresholdDb,
        double ratio,
        double kneeDb,
        double attackSeconds,
        double releaseSeconds)
    {
        if (source.Length == 0 || channels <= 0) return source.ToArray();
        float[] output = new float[source.Length];
        ApplyFirefoxWebAudioCompressorCore(source, output, sampleRate, channels, thresholdDb, ratio, kneeDb, attackSeconds, releaseSeconds);
        return output;
    }

    internal static void ApplyFirefoxWebAudioCompressorInPlace(
        float[] samples,
        int sampleRate,
        int channels,
        double thresholdDb,
        double ratio,
        double kneeDb,
        double attackSeconds,
        double releaseSeconds)
    {
        if (samples.Length == 0 || channels <= 0) return;
        ApplyFirefoxWebAudioCompressorCore(samples, samples, sampleRate, channels, thresholdDb, ratio, kneeDb, attackSeconds, releaseSeconds);
    }

    private static void ApplyFirefoxWebAudioCompressorCore(
        float[] source,
        float[] output,
        int sampleRate,
        int channels,
        double thresholdDb,
        double ratio,
        double kneeDb,
        double attackSeconds,
        double releaseSeconds)
    {
        int frames = source.Length / channels;
        float[][] delayBuffers = new float[channels][];
        for (int channel = 0; channel < channels; channel++) delayBuffers[channel] = new float[WebAudioCompressorDelayBufferFrames];

        ZeroPoleProcessor[][] preFilters = CreateEmphasisFilters(sampleRate, channels, preEmphasis: true);
        ZeroPoleProcessor[][] postFilters = CreateEmphasisFilters(sampleRate, channels, preEmphasis: false);

        var curve = new WebAudioCompressionCurve((float)thresholdDb, (float)kneeDb, Math.Max(1f, (float)ratio));
        float fullRangeGain = curve.Saturate(1f);
        float fullRangeMakeupGain = MathF.Pow(1f / Math.Max(fullRangeGain, 1e-12f), 0.6f);
        float masterLinearGain = fullRangeMakeupGain;

        float attackFrames = Math.Max(0.001f, (float)attackSeconds) * sampleRate;
        float releaseFramesBase = Math.Max(1f, (float)releaseSeconds * sampleRate);
        float satReleaseFrames = 0.0025f * sampleRate;

        float y1 = releaseFramesBase * WebAudioCompressorReleaseZone1;
        float y2 = releaseFramesBase * WebAudioCompressorReleaseZone2;
        float y3 = releaseFramesBase * WebAudioCompressorReleaseZone3;
        float y4 = releaseFramesBase * WebAudioCompressorReleaseZone4;
        float kA = 0.9999999999999998f * y1 + 1.8432219684323923e-16f * y2 - 1.9373394351676423e-16f * y3 + 8.824516011816245e-18f * y4;
        float kB = -1.5788320352845888f * y1 + 2.3305837032074286f * y2 - 0.9141194204840429f * y3 + 0.1623677525612032f * y4;
        float kC = 0.5334142869106424f * y1 - 1.272736789213631f * y2 + 0.9258856042207512f * y3 - 0.18656310191776226f * y4;
        float kD = 0.08783463138207234f * y1 - 0.1694162967925622f * y2 + 0.08588057951595272f * y3 - 0.00429891410546283f * y4;
        float kE = -0.042416883008123074f * y1 + 0.1115693827987602f * y2 - 0.09764676325265872f * y3 + 0.028494263462021576f * y4;

        int preDelayFrames = Math.Min(WebAudioCompressorDelayBufferFrames - 1, Math.Max(0, (int)(WebAudioCompressorPreDelaySeconds * sampleRate)));
        int preDelayReadIndex = 0;
        int preDelayWriteIndex = preDelayFrames;
        float detectorAverage = 0f;
        float compressorGain = 1f;
        float maxAttackCompressionDiffDb = -1f;
        int frameIndex = 0;

        while (frameIndex < frames)
        {
            int divisionFrames = Math.Min(WebAudioCompressorDivisionFrames, frames - frameIndex);
            if (!float.IsFinite(detectorAverage)) detectorAverage = 1f;

            float desiredGain = Clamp(detectorAverage, 0f, 1f);
            float scaledDesiredGain = MathF.Asin(desiredGain) / (MathF.PI * 0.5f);
            bool isReleasing = scaledDesiredGain > compressorGain;
            float compressionDiffDb = LinearToDbFloat(compressorGain / scaledDesiredGain);
            float envelopeRate;

            if (isReleasing)
            {
                maxAttackCompressionDiffDb = -1f;
                if (!float.IsFinite(compressionDiffDb)) compressionDiffDb = -1f;
                float x = Clamp(compressionDiffDb, -12f, 0f);
                x = 0.25f * (x + 12f);
                float x2 = x * x;
                float x3 = x2 * x;
                float x4 = x2 * x2;
                float releaseFrames = Math.Max(1f, kA + kB * x + kC * x2 + kD * x3 + kE * x4);
                envelopeRate = DbToLinearFloat(5f / releaseFrames);
            }
            else
            {
                if (!float.IsFinite(compressionDiffDb)) compressionDiffDb = 1f;
                if (maxAttackCompressionDiffDb < 0f || maxAttackCompressionDiffDb < compressionDiffDb)
                    maxAttackCompressionDiffDb = compressionDiffDb;
                float effectiveAttenuationDifferenceDb = Math.Max(0.5f, maxAttackCompressionDiffDb);
                float x = 0.25f / effectiveAttenuationDifferenceDb;
                envelopeRate = 1f - MathF.Pow(x, 1f / attackFrames);
            }

            for (int divisionFrame = 0; divisionFrame < divisionFrames; divisionFrame++, frameIndex++)
            {
                int offset = frameIndex * channels;
                float compressorInput = 0f;

                for (int channel = 0; channel < channels; channel++)
                {
                    float emphasized = float.IsFinite(source[offset + channel]) ? source[offset + channel] : 0f;
                    ZeroPoleProcessor[] channelPreFilters = preFilters[channel];
                    for (int stage = 0; stage < 4; stage++) emphasized = channelPreFilters[stage].Process(emphasized);
                    delayBuffers[channel][preDelayWriteIndex] = emphasized;
                    compressorInput = Math.Max(compressorInput, Math.Abs(emphasized));
                }

                float absInput = Math.Abs(compressorInput);
                float shapedInput = curve.Saturate(absInput);
                float attenuation = absInput <= 0.0001f ? 1f : shapedInput / absInput;
                float attenuationDb = Math.Max(2f, -LinearToDbFloat(attenuation));
                float satReleaseRate = DbToLinearFloat(attenuationDb / satReleaseFrames) - 1f;
                bool detectorIsReleasing = attenuation > detectorAverage;
                float detectorRate = detectorIsReleasing ? satReleaseRate : 1f;
                detectorAverage += (attenuation - detectorAverage) * detectorRate;
                detectorAverage = Math.Min(1f, detectorAverage);
                if (!float.IsFinite(detectorAverage)) detectorAverage = 1f;

                if (envelopeRate < 1f)
                {
                    compressorGain += (scaledDesiredGain - compressorGain) * envelopeRate;
                }
                else
                {
                    compressorGain *= envelopeRate;
                    compressorGain = Math.Min(1f, compressorGain);
                }

                float postWarpCompressorGain = MathF.Sin(MathF.PI * 0.5f * compressorGain);
                float totalGain = masterLinearGain * postWarpCompressorGain;

                for (int channel = 0; channel < channels; channel++)
                {
                    float sample = delayBuffers[channel][preDelayReadIndex] * totalGain;
                    ZeroPoleProcessor[] channelPostFilters = postFilters[channel];
                    for (int stage = 0; stage < 4; stage++) sample = channelPostFilters[stage].Process(sample);
                    output[offset + channel] = float.IsFinite(sample) ? sample : 0f;
                }

                preDelayReadIndex = (preDelayReadIndex + 1) & WebAudioCompressorDelayMask;
                preDelayWriteIndex = (preDelayWriteIndex + 1) & WebAudioCompressorDelayMask;
            }

            detectorAverage = FlushDenormal(detectorAverage);
            compressorGain = FlushDenormal(compressorGain);
        }

    }

    public static float[] ApplyStereoWidth(float[] source, int channels, double widthPercent, double sourceStereoRatio)
    {
        if (channels < 2) return source;
        float[] output = new float[source.Length];
        double baseWidth = Clamp(widthPercent / 100.0, 0.7, 1.18);
        double safetyFactor = sourceStereoRatio > 0.6 ? 0.7 : sourceStereoRatio > 0.45 ? 0.85 : 1;
        double width = baseWidth > 1 ? 1 + (baseWidth - 1) * safetyFactor : baseWidth;
        int frames = source.Length / channels;
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            double left = source[offset];
            double right = source[offset + 1];
            double mid = (left + right) * 0.5;
            double side = (left - right) * 0.5 * width;
            output[offset] = (float)(mid + side);
            output[offset + 1] = (float)(mid - side);
            for (int channel = 2; channel < channels; channel++) output[offset + channel] = source[offset + channel];
        }
        return output;
    }

    internal static void ApplyStereoWidthInPlace(float[] samples, int channels, double widthPercent, double sourceStereoRatio)
    {
        if (channels < 2) return;
        double baseWidth = Clamp(widthPercent / 100.0, 0.7, 1.18);
        double safetyFactor = sourceStereoRatio > 0.6 ? 0.7 : sourceStereoRatio > 0.45 ? 0.85 : 1;
        double width = baseWidth > 1 ? 1 + (baseWidth - 1) * safetyFactor : baseWidth;
        int frames = samples.Length / channels;
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            double left = samples[offset];
            double right = samples[offset + 1];
            double mid = (left + right) * 0.5;
            double side = (left - right) * 0.5 * width;
            samples[offset] = (float)(mid + side);
            samples[offset + 1] = (float)(mid - side);
        }
    }

    public static float[] ApplyStereoSpace(float[] source, int sampleRate, int channels, bool enabled)
    {
        if (!enabled || channels < 2) return source;
        float[] output = new float[source.Length];
        double sideLift = 0.14;
        double rc = 1 / (2 * Math.PI * 220);
        double dt = 1.0 / sampleRate;
        double alpha = rc / (rc + dt);
        double previousSide = 0;
        double previousHighSide = 0;
        int frames = source.Length / channels;
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            double left = source[offset];
            double right = source[offset + 1];
            double mid = (left + right) * 0.5;
            double side = (left - right) * 0.5;
            double highSide = alpha * (previousHighSide + side - previousSide);
            double wideSide = side + highSide * sideLift;
            output[offset] = (float)(mid + wideSide);
            output[offset + 1] = (float)(mid - wideSide);
            for (int channel = 2; channel < channels; channel++) output[offset + channel] = source[offset + channel];
            previousSide = side;
            previousHighSide = highSide;
        }
        return output;
    }

    internal static void ApplyStereoSpaceInPlace(float[] samples, int sampleRate, int channels, bool enabled)
    {
        if (!enabled || channels < 2) return;
        double sideLift = 0.14;
        double rc = 1 / (2 * Math.PI * 220);
        double dt = 1.0 / sampleRate;
        double alpha = rc / (rc + dt);
        double previousSide = 0;
        double previousHighSide = 0;
        int frames = samples.Length / channels;
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            double left = samples[offset];
            double right = samples[offset + 1];
            double mid = (left + right) * 0.5;
            double side = (left - right) * 0.5;
            double highSide = alpha * (previousHighSide + side - previousSide);
            double wideSide = side + highSide * sideLift;
            samples[offset] = (float)(mid + wideSide);
            samples[offset + 1] = (float)(mid - wideSide);
            previousSide = side;
            previousHighSide = highSide;
        }
    }

    public static float[] ApplyGentleDensity(float[] source, int density)
    {
        double blend = Clamp(density / 100.0, 0, 1) * 0.16;
        if (blend <= 0.001) return source;
        float[] output = source.ToArray();
        ApplyGentleDensityInPlace(output, density);
        return output;
    }

    internal static void ApplyGentleDensityInPlace(float[] samples, int density)
    {
        double blend = Clamp(density / 100.0, 0, 1) * 0.16;
        if (blend <= 0.001) return;
        double drive = 1.08 + Clamp(density / 100.0, 0, 1) * 0.18;
        for (int index = 0; index < samples.Length; index++)
        {
            double clean = double.IsFinite(samples[index]) ? samples[index] : 0;
            double saturated = Math.Tanh(clean * drive);
            samples[index] = (float)(clean * (1 - blend) + saturated * blend);
        }
    }

    public static float[] ApplyGain(float[] source, double gain)
    {
        float[] output = source.ToArray();
        ApplyGainInPlace(output, gain);
        return output;
    }

    internal static void ApplyGainInPlace(float[] samples, double gain)
    {
        for (int index = 0; index < samples.Length; index++) samples[index] = (float)(samples[index] * gain);
    }

    public static float[] RemoveDcOffset(float[] source, int channels)
    {
        float[] output = new float[source.Length];
        double[] sums = new double[channels];
        int frames = source.Length / channels;
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            for (int channel = 0; channel < channels; channel++) sums[channel] += source[offset + channel];
        }
        for (int channel = 0; channel < channels; channel++) sums[channel] /= Math.Max(1, frames);
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            for (int channel = 0; channel < channels; channel++) output[offset + channel] = (float)(source[offset + channel] - sums[channel]);
        }
        return output;
    }

    internal static void RemoveDcOffsetInPlace(float[] samples, int channels)
    {
        double[] sums = new double[channels];
        int frames = samples.Length / channels;
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            for (int channel = 0; channel < channels; channel++) sums[channel] += samples[offset + channel];
        }
        for (int channel = 0; channel < channels; channel++) sums[channel] /= Math.Max(1, frames);
        for (int frame = 0; frame < frames; frame++)
        {
            int offset = frame * channels;
            for (int channel = 0; channel < channels; channel++) samples[offset + channel] = (float)(samples[offset + channel] - sums[channel]);
        }
    }

    public static float[] ApplyEdgeFade(float[] source, int sampleRate, int channels, double milliseconds = 8)
    {
        float[] output = source.ToArray();
        ApplyEdgeFadeInPlace(output, sampleRate, channels, milliseconds);
        return output;
    }

    internal static void ApplyEdgeFadeInPlace(float[] samples, int sampleRate, int channels, double milliseconds = 8)
    {
        int frames = samples.Length / channels;
        int fadeFrames = Math.Min(frames / 2, Math.Max(1, (int)Math.Floor(sampleRate * milliseconds / 1000.0)));
        if (fadeFrames <= 1) return;
        for (int frame = 0; frame < fadeFrames; frame++)
        {
            double inGain = frame / (double)fadeFrames;
            double outGain = (fadeFrames - frame) / (double)fadeFrames;
            int startOffset = frame * channels;
            int endOffset = (frames - 1 - frame) * channels;
            for (int channel = 0; channel < channels; channel++)
            {
                samples[startOffset + channel] *= (float)inGain;
                samples[endOffset + channel] *= (float)outGain;
            }
        }
    }

    public static (float[] Output, double MaxReductionDb) ApplyLinkedLookaheadLimiter(float[] source, int sampleRate, int channels, double ceilingDb, double lookaheadMs = 3, double releaseMs = 85)
    {
        float[] output = new float[source.Length];
        double maxReductionDb = ApplyLinkedLookaheadLimiterCore(source, output, sampleRate, channels, ceilingDb, lookaheadMs, releaseMs);
        return (output, maxReductionDb);
    }

    internal static double ApplyLinkedLookaheadLimiterInPlace(float[] samples, int sampleRate, int channels, double ceilingDb, double lookaheadMs = 3, double releaseMs = 85)
    {
        return ApplyLinkedLookaheadLimiterCore(samples, samples, sampleRate, channels, ceilingDb, lookaheadMs, releaseMs);
    }

    private static double ApplyLinkedLookaheadLimiterCore(float[] source, float[] output, int sampleRate, int channels, double ceilingDb, double lookaheadMs, double releaseMs)
    {
        double ceiling = Clamp(DbToLinear(ceilingDb), 1e-6, 1);
        int frames = source.Length / channels;
        int lookaheadSamples = Math.Max(0, JsRoundToInt(sampleRate * lookaheadMs / 1000.0));
        int releaseSamples = Math.Max(1, JsRoundToInt(sampleRate * releaseMs / 1000.0));
        double releaseCoefficient = Math.Exp(-1.0 / releaseSamples);

        int capacity = Math.Max(2, lookaheadSamples + 2);
        int[] dequeIndices = new int[capacity];
        float[] dequePeaks = new float[capacity];
        int dequeHead = 0;
        int dequeLength = 0;
        double currentGain = 1;
        double maxReductionDb = 0;

        int Position(int offset) => (dequeHead + offset) % capacity;
        void PopFront() { if (dequeLength > 0) { dequeHead = (dequeHead + 1) % capacity; dequeLength--; } }
        void PopBack() { if (dequeLength > 0) dequeLength--; }
        void PushBack(int index, float peak) { int position = Position(dequeLength); dequeIndices[position] = index; dequePeaks[position] = peak; dequeLength++; }

        int finalInputIndex = frames + lookaheadSamples;
        for (int scanIndex = 0; scanIndex < finalInputIndex; scanIndex++)
        {
            if (scanIndex < frames)
            {
                int sourceOffset = scanIndex * channels;
                float framePeak = 0;
                for (int channel = 0; channel < channels; channel++) framePeak = Math.Max(framePeak, Math.Abs(source[sourceOffset + channel]));
                while (dequeLength > 0)
                {
                    int backPosition = Position(dequeLength - 1);
                    if (dequePeaks[backPosition] > framePeak) break;
                    PopBack();
                }
                PushBack(scanIndex, framePeak);
            }

            int outputIndex = scanIndex - lookaheadSamples;
            if (outputIndex < 0 || outputIndex >= frames) continue;
            while (dequeLength > 0 && dequeIndices[dequeHead] < outputIndex) PopFront();
            double detectedPeak = dequeLength > 0 ? dequePeaks[dequeHead] : 0;
            double targetGain = detectedPeak > ceiling ? ceiling / Math.Max(detectedPeak, 1e-12) : 1;
            currentGain = targetGain < currentGain ? targetGain : targetGain + releaseCoefficient * (currentGain - targetGain);
            currentGain = Clamp(currentGain, 0, 1);
            if (currentGain < 0.999999) maxReductionDb = Math.Max(maxReductionDb, -LinearToDb(currentGain));
            int inputOffset = outputIndex * channels;
            for (int channel = 0; channel < channels; channel++)
            {
                output[inputOffset + channel] = Clamp((float)(source[inputOffset + channel] * currentGain), (float)-ceiling, (float)ceiling);
            }
        }
        return maxReductionDb;
    }

    private static ZeroPoleProcessor[][] CreateEmphasisFilters(int sampleRate, int channels, bool preEmphasis)
    {
        var filters = new ZeroPoleProcessor[channels][];
        for (int channel = 0; channel < channels; channel++) filters[channel] = new ZeroPoleProcessor[4];
        float normalizedFrequency = Clamp(WebAudioCompressorAnchorFrequency / (sampleRate * 0.5f), 0f, 1f);
        float stageGain = WebAudioCompressorFilterStageGainDb;
        for (int stage = 0; stage < 4; stage++)
        {
            float gainFactor = 1f - stageGain / 20f;
            float frequency1 = normalizedFrequency * gainFactor;
            float frequency2 = normalizedFrequency / Math.Max(gainFactor, 1e-6f);
            float radius1 = MathF.Exp(-frequency1 * MathF.PI);
            float radius2 = MathF.Exp(-frequency2 * MathF.PI);
            float zero = preEmphasis ? radius1 : radius2;
            float pole = preEmphasis ? radius2 : radius1;
            for (int channel = 0; channel < channels; channel++) filters[channel][stage] = new ZeroPoleProcessor(zero, pole);
            normalizedFrequency /= WebAudioCompressorFilterStageRatio;
        }
        return filters;
    }

    private static float DbToLinearFloat(float db) => MathF.Pow(10f, db / 20f);
    private static float LinearToDbFloat(float linear) => linear <= 0f ? -1000f : 20f * MathF.Log10(linear);
    private static float FlushDenormal(float value) => Math.Abs(value) < 1e-30f ? 0f : value;
    private static int JsRoundToInt(double value) => (int)Math.Floor(value + 0.5);

    private static BiquadCoefficients Normalize(double b0, double b1, double b2, double a0, double a1, double a2)
    {
        return new BiquadCoefficients(b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
    }

    private sealed class WebAudioCompressionCurve
    {
        private readonly float _linearThreshold;
        private readonly float _kneeThreshold;
        private readonly float _kneeThresholdDb;
        private readonly float _yKneeThresholdDb;
        private readonly float _slope;
        private readonly float _k;

        public WebAudioCompressionCurve(float thresholdDb, float kneeDb, float ratio)
        {
            _linearThreshold = DbToLinearFloat(thresholdDb);
            _kneeThresholdDb = thresholdDb + kneeDb;
            _kneeThreshold = DbToLinearFloat(_kneeThresholdDb);
            _slope = 1f / ratio;
            _k = FindK(thresholdDb, kneeDb, _slope, _linearThreshold);
            _yKneeThresholdDb = LinearToDbFloat(KneeCurve(_kneeThreshold, _k));
        }

        public float Saturate(float input)
        {
            if (input < _kneeThreshold) return KneeCurve(input, _k);
            float inputDb = LinearToDbFloat(input);
            float outputDb = _yKneeThresholdDb + _slope * (inputDb - _kneeThresholdDb);
            return DbToLinearFloat(outputDb);
        }

        private float KneeCurve(float input, float k)
        {
            if (input < _linearThreshold) return input;
            return _linearThreshold + (1f - MathF.Exp(-k * (input - _linearThreshold))) / k;
        }

        private static float FindK(float thresholdDb, float kneeDb, float desiredSlope, float linearThreshold)
        {
            float x = DbToLinearFloat(thresholdDb + kneeDb);
            float minK = 0.1f;
            float maxK = 10000f;
            float k = 5f;
            for (int index = 0; index < 15; index++)
            {
                float slope = SlopeAt(x, k, linearThreshold);
                if (slope < desiredSlope) maxK = k;
                else minK = k;
                k = MathF.Sqrt(minK * maxK);
            }
            return k;
        }

        private static float SlopeAt(float input, float k, float linearThreshold)
        {
            if (input < linearThreshold) return 1f;
            float input2 = input * 1.001f;
            float inputDb = LinearToDbFloat(input);
            float input2Db = LinearToDbFloat(input2);
            float outputDb = LinearToDbFloat(StaticKneeCurve(input, k, linearThreshold));
            float output2Db = LinearToDbFloat(StaticKneeCurve(input2, k, linearThreshold));
            return (output2Db - outputDb) / (input2Db - inputDb);
        }

        private static float StaticKneeCurve(float input, float k, float linearThreshold)
        {
            if (input < linearThreshold) return input;
            return linearThreshold + (1f - MathF.Exp(-k * (input - linearThreshold))) / k;
        }
    }
}

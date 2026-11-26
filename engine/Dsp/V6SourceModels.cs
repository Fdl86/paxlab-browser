namespace Paxlab.Studio.App.Models;

public enum SunoSourceMode
{
    V55,
    V6
}

public sealed record V6RestorationOptions(
    bool StereoSpaceIntent,
    bool VocalPresenceIntent);

public sealed record V6SourceMetrics(
    int ActiveWindowCount,
    double CorrelationMedian,
    double GlobalSideMidDbMedian,
    double LowSideMidDbMedian,
    double LowMidSideMidDbMedian,
    double WidthLowSideMidDbMedian,
    double VocalSideMidDbMedian,
    double UpperPresenceSideMidDbMedian,
    double SibilanceSideMidDbMedian,
    double BoxRelativeDbMedian,
    double VocalRelativeDbMedian,
    double PresenceRelativeDbMedian,
    double SibilanceRelativeDbMedian,
    double FizzRelativeDbMedian,
    double SibilanceTemporalCrestDb,
    double FizzTemporalCrestDb,
    double FizzSpectralFlatnessMedian,
    double SibilanceVsPresenceDbMedian);

public sealed record V6RestorationPlan(
    double LowSideReductionDb,
    double StereoRecovery700To1500Db,
    double StereoRecovery1500To4000Db,
    double StereoRecovery4000To6000Db,
    double PresenceCorrectionDb,
    double BoxinessMaxReductionDb,
    double SibilanceMaxReductionDb,
    double HfArtifactMaxReductionDb,
    bool BoxinessDynamic,
    bool SibilanceDynamic,
    bool HfArtifactDynamic)
{
    public bool HasAnyCorrection =>
        LowSideReductionDb > .01 ||
        StereoRecovery700To1500Db > .01 ||
        StereoRecovery1500To4000Db > .01 ||
        StereoRecovery4000To6000Db > .01 ||
        Math.Abs(PresenceCorrectionDb) > .01 ||
        BoxinessMaxReductionDb > .01 ||
        SibilanceMaxReductionDb > .01 ||
        HfArtifactMaxReductionDb > .01;
}

public sealed record V6RestorationReport(
    double MaxBoxinessReductionDb,
    double MaxSibilanceReductionDb,
    double MaxHfArtifactReductionDb,
    IReadOnlyList<string> Moves);

public sealed record V6RestorationResult(
    WaveAudioData Audio,
    V6SourceMetrics Metrics,
    V6RestorationPlan Plan,
    V6RestorationReport Report)
{
    // Optional monitoring data. Never fed back into the audio processing chain.
    // Original stage signal (after stereo/presence) minus the three attenuation
    // stages (boxiness, sibilance, HF artifacts), at native gain and sample time.
    public WaveAudioData? RemovedAudio { get; init; }
}

public sealed record V6PreparedSource(
    V6RestorationResult Restoration,
    MasteringMetrics RestoredMetrics);

public sealed record V6TruePeakGuardResult(
    WaveAudioData Audio,
    double TruePeakBeforeDb,
    double TruePeakAfterDb,
    double GainReductionDb,
    bool Applied);

namespace Paxlab.Studio.App.Models;

public sealed record MasteringSettings(
    string Id,
    string Label,
    string Description,
    string HighTreatment,
    int Intensity,
    double TargetRmsDb,
    double TargetLufsEstimate,
    double MaxPeakDb,
    double StereoWidth,
    int Density,
    string SourceRepair,
    string AutoIntensity,
    bool AntiFatigue,
    bool VocalPresence,
    bool StereoSpace,
    bool BassPunch,
    bool SpacePreserve)
{
    public override string ToString() => Label;
}

public sealed record MasteringMetrics(
    double PeakLinear,
    double PeakDb,
    double RmsLinear,
    double RmsDb,
    double CrestFactorDb,
    double DurationSeconds,
    double EstimatedLufs,
    double ShortTermLufs,
    double LoudnessRange,
    double ApproxTruePeakDb,
    double StereoCorrelation,
    double LeftRightBalanceDb,
    int ClippingSamples,
    double ClippingRatio,
    double NoiseFloorEstimateDb,
    double SubRatio,
    double LowRatio,
    double PresenceRatio,
    double BrightnessRatio,
    double FizzRatio,
    double UltraHighRatio,
    double HighTotalRatio,
    double SpectralCentroidHz);

public sealed record AutoMasterPlan(
    string Profile,
    string ProfileLabel,
    double TargetLufsEstimate,
    double TargetLufsMinEstimate,
    double TargetLufsMaxEstimate,
    double TargetRmsDb,
    double CeilingDb,
    double TargetHeadroomDb,
    double TargetHeadroomMinDb,
    double TargetHeadroomMaxDb,
    double ExpectedLiftDb,
    string CompressionIntent,
    string SafetyIntent,
    string Reason);

public sealed record RecommendedPreviewPlan(
    MasteringSettings Settings,
    string AutoIntensity,
    bool AntiFatigue,
    string Label,
    string Reason);

public sealed record AdvisorMove(
    string Id,
    string Title,
    string Detail,
    string Severity);

public sealed record AdvisorResult(
    string Summary,
    IReadOnlyList<AdvisorMove> Moves,
    MasteringSettings RecommendedSettings,
    string Confidence);

public sealed record MasteringReport(
    string ProfileLabel,
    IReadOnlyList<string> AppliedMoves,
    int ClippedSamplesDetected,
    int ClicksRepaired,
    double LimiterMaxReductionDb,
    double GainAppliedDb,
    double BrightnessChangePercent,
    double BassChangePercent,
    double StereoChangePercent,
    double RenderTimeMs,
    MasteringSettings Settings);

public sealed record MasteringRenderResult(
    WaveAudioData Audio,
    MasteringMetrics Before,
    MasteringMetrics After,
    MasteringReport Report);

using Paxlab.Studio.App.Models;

namespace Paxlab.Studio.App.Services;

public static class V6MasteringPipeline
{
    public static V6PreparedSource Prepare(
        WaveAudioData source,
        MasteringMetrics sourceMetrics,
        V6RestorationOptions options,
        IProgress<string>? progress = null,
        bool captureRemoved = false)
    {
        V6RestorationResult restoration = V6RestorationEngine.Restore(source, sourceMetrics, options, progress, captureRemoved);
        progress?.Report("Réanalyse après restauration V6");
        MasteringMetrics restoredMetrics = AudioMetricsAnalyzer.Analyze(restoration.Audio);
        return new V6PreparedSource(restoration, restoredMetrics);
    }

    public static MasteringRenderResult FinalizeRender(
        MasteringRenderResult legacyRender,
        MasteringMetrics originalMetrics,
        MasteringSettings userFacingSettings,
        V6RestorationResult restoration,
        double truePeakCeilingDb)
    {
        V6TruePeakGuardResult guard = V6TruePeakGuard.Apply(legacyRender.Audio, truePeakCeilingDb);
        MasteringMetrics after = guard.Applied ? AudioMetricsAnalyzer.Analyze(guard.Audio) : legacyRender.After;
        var moves = new List<string>(restoration.Report.Moves)
        {
            "V6 - source réanalysée avant le preset PAXLAB"
        };
        moves.AddRange(legacyRender.Report.AppliedMoves.Where(move =>
            !move.StartsWith("Limiteur stéréo lié", StringComparison.OrdinalIgnoreCase)));
        moves.Add(legacyRender.Report.LimiterMaxReductionDb > .02
            ? $"Limiteur PAXLAB: -{legacyRender.Report.LimiterMaxReductionDb:0.00} dB max"
            : "Limiteur PAXLAB: non requis");
        moves.Add(guard.Applied
            ? $"V6 - garde true peak 4x: -{guard.GainReductionDb:0.00} dB, final {guard.TruePeakAfterDb:0.00} dBTP"
            : $"V6 - garde true peak 4x: non requise ({guard.TruePeakAfterDb:0.00} dBTP)");

        MasteringReport report = legacyRender.Report with
        {
            AppliedMoves = moves,
            GainAppliedDb = after.EstimatedLufs - originalMetrics.EstimatedLufs,
            Settings = userFacingSettings
        };
        return new MasteringRenderResult(guard.Audio, originalMetrics, after, report);
    }
}

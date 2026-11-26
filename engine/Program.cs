using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using System.Text.Json.Serialization;
using Paxlab.Studio.App.Models;
using Paxlab.Studio.App.Services;

public static partial class Program
{
    private static WaveAudioData? source, rendered, removed, difference;
    private static MasteringMetrics? metrics;
    private static string report = "{}";
    public static void Main() { }

    [JSExport]
    public static string Detect(byte[] pcm)
    {
        var d = SunoWaveGenerationDetector.Analyze(pcm);
        return JsonSerializer.Serialize(new WebDetection(d.Verdict == SunoWaveGenerationVerdict.V55Probable ? "v55" : d.Verdict == SunoWaveGenerationVerdict.V6Probable ? "v6" : "", d.HighFrequencySlopeDb, d.SupportingExcerpts, d.ExcerptCount), WebJsonContext.Default.WebDetection);
    }

    [JSExport]
    public static string Load(byte[] pcm, int rate, int channels)
    {
        source = rendered = removed = difference = null; metrics = null; report = "{}";
        if (rate < 8000 || rate > 192000 || channels is < 1 or > 2 || pcm.Length == 0 || pcm.Length % (channels * 4) != 0 || pcm.Length > 192 * 1024 * 1024) throw new ArgumentException("Invalid PCM");
        var samples = new float[pcm.Length / 4]; Buffer.BlockCopy(pcm, 0, samples, 0, pcm.Length);
        if (samples.Any(s => !float.IsFinite(s))) throw new ArgumentException("Non-finite PCM");
        source = new WaveAudioData(rate, channels, 32, samples, "Web PCM");
        metrics = AudioMetricsAnalyzer.Analyze(source);
        var recommended = AutoMasteringPlanner.BuildRecommendedPreviewPlan(metrics);
        return JsonSerializer.Serialize(new WebAnalysis(metrics, new WebRecommendation(recommended.AutoIntensity, recommended.AntiFatigue)), WebJsonContext.Default.WebAnalysis);
    }

    public sealed record Settings(string Mode, string Preset, string Rider, string RiderProfile, string Level, bool MasterB, bool AntiFatigue, bool VocalPresence, bool StereoSpace, bool BassPunch, bool SpacePreserve);

    // Synchronous progress reporting: Progress<T> would queue the callbacks until
    // the WASM render returns. The worker forwards each event to the UI immediately.
    [JSImport("globalThis.paxlabProgress")]
    internal static partial void NotifyProgress(string stage);

    private sealed class WebProgress : IProgress<string>
    {
        public void Report(string value) => NotifyProgress(value switch
        {
            "Analyse du morceau" => "stageAnalysis",
            "Réparation source" => "stageCleanup",
            "Correction du spectre" => "stageSpectrum",
            "Optimisation dynamique" => "stageDynamics",
            "Normalisation du niveau" => "stageNormalize",
            "Sécurité peak" => "stageSafety",
            "Diagnostic source Suno V6" => "stageV6Diagnostic",
            "Restauration spatiale V6" => "stageV6Space",
            "Compensation présence V6" => "stageV6Presence",
            "Contrôle boxiness V6" => "stageV6Boxiness",
            "Contrôle sifflantes V6" => "stageV6Sibilance",
            "Suppression artefacts HF V6" => "stageV6HF",
            "Réanalyse après restauration V6" => "stageV6Analysis",
            _ => "stageProcessing"
        });
    }

    [JSExport]
    public static byte[] Render(string options)
    {
        rendered = removed = difference = null; report = "{}";
        var input = source ?? throw new InvalidOperationException("No audio");
        var before = metrics ?? throw new InvalidOperationException("No metrics");
        var o = JsonSerializer.Deserialize(options, WebJsonContext.Default.Settings) ?? throw new ArgumentException("No settings");
        if (o.Mode is not ("v55" or "v6")) throw new ArgumentException("Generation required");
        var (preset, intensity) = o.Preset switch { "safe" => ("auto", "safe"), "impact" => ("power", "impact"), "youtube" => ("youtube", "youtube"), "smooth" => ("smooth", "safe"), "open" => ("open", "balanced"), "balanced" => ("auto", "balanced"), _ => throw new ArgumentException("Invalid preset") };
        MasteringSettings Build(MasteringMetrics m) => AutoMasteringPlanner.BuildSettingsFromAnalysis(m, preset, intensity, o.AntiFatigue, o.VocalPresence, o.StereoSpace, o.BassPunch, intensity != "youtube" && o.SpacePreserve);
        var finishing = new AdaptiveFinishingOptions(o.MasterB, o.Level switch { "doux" => SectionLevelMode.Doux, "progressif" => SectionLevelMode.Progressif, _ => SectionLevelMode.Off });
        var rider = finishing.Enabled ? AutoLevelRiderMode.Off : o.Rider switch { "auto" => AutoLevelRiderMode.Auto, "forced" => AutoLevelRiderMode.Forced, _ => AutoLevelRiderMode.Off };
        bool riderApplied = false; double riderReduction = 0;
        var progress = new WebProgress();
        NotifyProgress("stagePlan");
        var current = input; var currentMetrics = before;
        if (rider != AutoLevelRiderMode.Off)
        {
            NotifyProgress("stageRider");
            var plan = AutoLevelRider.Analyze(input, AutoLevelRiderOptions.ForProfile(o.RiderProfile), rider == AutoLevelRiderMode.Forced);
            if (AutoLevelRider.ShouldApply(rider, plan)) { NotifyProgress("stageRiderApply"); current = AutoLevelRider.Apply(input, plan); currentMetrics = AudioMetricsAnalyzer.Analyze(current); riderApplied = true; riderReduction = plan.MaximumReductionDb; }
        }
        var settings = Build(currentMetrics);
        MasteringRenderResult result;
        if (o.Mode == "v6")
        {
            var prepared = V6MasteringPipeline.Prepare(current, currentMetrics, new V6RestorationOptions(o.StereoSpace, o.VocalPresence && !o.AntiFatigue && !o.BassPunch), progress: progress, captureRemoved: true);
            removed = prepared.Restoration.RemovedAudio;
            // A captured but entirely silent buffer is not an available residual.
            if (removed is not null && !Array.Exists(removed.Samples, s => float.IsFinite(s) && s != 0f)) removed = null;
            var protectedSettings = V6RestorationEngine.ProtectLegacyV6Path(Build(prepared.RestoredMetrics));
            var legacy = MasteringEngine.Render(prepared.Restoration.Audio, protectedSettings, progress);
            NotifyProgress("stageV6Guard");
            result = V6MasteringPipeline.FinalizeRender(legacy, before, settings, prepared.Restoration, Math.Min(-1.5, protectedSettings.MaxPeakDb));
        }
        else result = MasteringEngine.Render(current, settings, progress);
        if (rider != AutoLevelRiderMode.Off) result = result with { Before = before, Report = result.Report with { GainAppliedDb = result.After.EstimatedLufs - before.EstimatedLufs } };
        if (finishing.Enabled) { NotifyProgress("stageFinishing"); result = AdaptiveFinishingProcessor.Apply(result, finishing); }
        NotifyProgress("stageFinalMetrics");
        rendered = result.Audio;
        if (rendered.Samples.Any(s => !float.IsFinite(s))) { rendered = null; throw new InvalidOperationException("Non-finite render"); }
        report = JsonSerializer.Serialize(new WebRenderReport(before, result.After, riderApplied, riderReduction, finishing.Enabled && o.Rider != "off", removed != null, result.Report.LimiterMaxReductionDb, V6TruePeakGuard.Measure4x(rendered)), WebJsonContext.Default.WebRenderReport);
        NotifyProgress("stageTransfer");
        return Bytes(rendered);
    }
    [JSExport] public static string Report() => report;
    [JSExport] public static byte[] Monitor(string mode)
    {
        if (mode == "removed") return Bytes(removed ?? throw new InvalidOperationException("No removed audio"));
        if (mode != "difference") throw new ArgumentException("Invalid monitor");
        difference ??= DifferencePreviewProcessor.Build(source ?? throw new InvalidOperationException(), rendered ?? throw new InvalidOperationException()).Audio;
        return Bytes(difference);
    }
    private static byte[] Bytes(WaveAudioData audio) { var bytes = new byte[audio.Samples.Length * 4]; Buffer.BlockCopy(audio.Samples, 0, bytes, 0, bytes.Length); return bytes; }
}

// Explicit JSON contracts preserve the worker protocol under WebAssembly trimming.
internal sealed record WebDetection(string Mode, double? Slope, int Supporting, int Count);
internal sealed record WebRecommendation(string Preset, bool AntiFatigue);
internal sealed record WebAnalysis(MasteringMetrics Metrics, WebRecommendation Recommended);
internal sealed record WebRenderReport(MasteringMetrics Before, MasteringMetrics After,
    bool RiderApplied, double RiderReduction, bool RiderBypassed, bool HasRemoved,
    double LimiterReduction, double TruePeak4x);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    PropertyNameCaseInsensitive = true, NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals)]
[JsonSerializable(typeof(Program.Settings), TypeInfoPropertyName = "Settings")]
[JsonSerializable(typeof(WebDetection))]
[JsonSerializable(typeof(WebAnalysis))]
[JsonSerializable(typeof(WebRenderReport))]
internal partial class WebJsonContext : JsonSerializerContext { }

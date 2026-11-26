using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;
using System.Text.Json.Serialization;
using Paxlab.Studio.App.Models;
using Paxlab.Studio.App.Services;

public static partial class Program
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { NumberHandling = JsonNumberHandling.AllowNamedFloatingPointLiterals };
    private static WaveAudioData? source, rendered, removed, difference;
    private static MasteringMetrics? metrics;
    private static string report = "{}";
    public static void Main() { }

    [JSExport]
    public static string Detect(byte[] pcm)
    {
        var d = SunoWaveGenerationDetector.Analyze(pcm);
        return JsonSerializer.Serialize(new { mode = d.Verdict == SunoWaveGenerationVerdict.V55Probable ? "v55" : d.Verdict == SunoWaveGenerationVerdict.V6Probable ? "v6" : "", slope = d.HighFrequencySlopeDb, supporting = d.SupportingExcerpts, count = d.ExcerptCount }, Json);
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
        return JsonSerializer.Serialize(new { metrics, recommended = new { preset = recommended.AutoIntensity, antiFatigue = recommended.AntiFatigue } }, Json);
    }

    public sealed record Settings(string Mode, string Preset, string Rider, string RiderProfile, string Level, bool MasterB, bool AntiFatigue, bool VocalPresence, bool StereoSpace, bool BassPunch, bool SpacePreserve);

    [JSExport]
    public static byte[] Render(string options)
    {
        rendered = removed = difference = null; report = "{}";
        var input = source ?? throw new InvalidOperationException("No audio");
        var before = metrics ?? throw new InvalidOperationException("No metrics");
        var o = JsonSerializer.Deserialize<Settings>(options, Json) ?? throw new ArgumentException("No settings");
        if (o.Mode is not ("v55" or "v6")) throw new ArgumentException("Generation required");
        var (preset, intensity) = o.Preset switch { "safe" => ("auto", "safe"), "impact" => ("power", "impact"), "youtube" => ("youtube", "youtube"), "smooth" => ("smooth", "safe"), "open" => ("open", "balanced"), "balanced" => ("auto", "balanced"), _ => throw new ArgumentException("Invalid preset") };
        MasteringSettings Build(MasteringMetrics m) => AutoMasteringPlanner.BuildSettingsFromAnalysis(m, preset, intensity, o.AntiFatigue, o.VocalPresence, o.StereoSpace, o.BassPunch, intensity != "youtube" && o.SpacePreserve);
        var finishing = new AdaptiveFinishingOptions(o.MasterB, o.Level switch { "doux" => SectionLevelMode.Doux, "progressif" => SectionLevelMode.Progressif, _ => SectionLevelMode.Off });
        var rider = finishing.Enabled ? AutoLevelRiderMode.Off : o.Rider switch { "auto" => AutoLevelRiderMode.Auto, "forced" => AutoLevelRiderMode.Forced, _ => AutoLevelRiderMode.Off };
        bool riderApplied = false; double riderReduction = 0;
        var current = input; var currentMetrics = before;
        if (rider != AutoLevelRiderMode.Off)
        {
            var plan = AutoLevelRider.Analyze(input, AutoLevelRiderOptions.ForProfile(o.RiderProfile), rider == AutoLevelRiderMode.Forced);
            if (AutoLevelRider.ShouldApply(rider, plan)) { current = AutoLevelRider.Apply(input, plan); currentMetrics = AudioMetricsAnalyzer.Analyze(current); riderApplied = true; riderReduction = plan.MaximumReductionDb; }
        }
        var settings = Build(currentMetrics);
        MasteringRenderResult result;
        if (o.Mode == "v6")
        {
            var prepared = V6MasteringPipeline.Prepare(current, currentMetrics, new V6RestorationOptions(o.StereoSpace, o.VocalPresence && !o.AntiFatigue && !o.BassPunch), captureRemoved: true);
            removed = prepared.Restoration.RemovedAudio;
            var protectedSettings = V6RestorationEngine.ProtectLegacyV6Path(Build(prepared.RestoredMetrics));
            result = V6MasteringPipeline.FinalizeRender(MasteringEngine.Render(prepared.Restoration.Audio, protectedSettings), before, settings, prepared.Restoration, Math.Min(-1.5, protectedSettings.MaxPeakDb));
        }
        else result = MasteringEngine.Render(current, settings);
        if (rider != AutoLevelRiderMode.Off) result = result with { Before = before, Report = result.Report with { GainAppliedDb = result.After.EstimatedLufs - before.EstimatedLufs } };
        if (finishing.Enabled) result = AdaptiveFinishingProcessor.Apply(result, finishing);
        rendered = result.Audio;
        if (rendered.Samples.Any(s => !float.IsFinite(s))) { rendered = null; throw new InvalidOperationException("Non-finite render"); }
        report = JsonSerializer.Serialize(new { before, after = result.After, riderApplied, riderReduction, riderBypassed = finishing.Enabled && o.Rider != "off", hasRemoved = removed != null, limiterReduction = result.Report.LimiterMaxReductionDb, truePeak4x = V6TruePeakGuard.Measure4x(rendered) }, Json);
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

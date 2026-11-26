namespace Paxlab.Studio.App.Models;

public sealed record WaveAudioData(
    int SampleRate,
    int Channels,
    int BitsPerSample,
    float[] Samples,
    string SourceFormat);

import {
  analyzeAudioBuffer,
  applySafeTargetGain,
  clamp
} from "./audioBufferUtils";
import type { PreviewRenderResult, PreviewSettings } from "./types";

interface ProcessingProfile {
  highShelfGain: number;
  harshDipGain: number;
  presenceGain: number;
  lowShelfGain: number;
  compressorThreshold: number;
  compressorRatio: number;
  makeupGain: number;
}

function getProcessingProfile(settings: PreviewSettings): ProcessingProfile {
  const amount = clamp(settings.intensity / 100, 0, 1);

  const highTreatmentGain =
    settings.highTreatment === "soft"
      ? -2.8
      : settings.highTreatment === "open"
        ? 1.2
        : -0.6;

  const presetWeight =
    settings.presetId === "smooth"
      ? 1.15
      : settings.presetId === "open"
        ? 0.72
        : settings.presetId === "balanced"
          ? 0.88
          : 1;

  return {
    highShelfGain: highTreatmentGain * amount * presetWeight,
    harshDipGain: -2.4 * amount * presetWeight,
    presenceGain: settings.highTreatment === "open" ? 0.7 * amount : -0.5 * amount,
    lowShelfGain: settings.presetId === "open" ? -0.3 * amount : 0.55 * amount,
    compressorThreshold: -22 + 8 * (1 - amount),
    compressorRatio: 1.55 + 1.2 * amount,
    makeupGain: 1 + 0.08 * amount
  };
}

export async function renderPreviewMaster(
  inputBuffer: AudioBuffer,
  settings: PreviewSettings
): Promise<PreviewRenderResult> {
  const startedAt = performance.now();
  const beforeMetrics = analyzeAudioBuffer(inputBuffer);
  const profile = getProcessingProfile(settings);

  const offlineContext = new OfflineAudioContext(
    inputBuffer.numberOfChannels,
    inputBuffer.length,
    inputBuffer.sampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = inputBuffer;

  const highPass = offlineContext.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 28;
  highPass.Q.value = 0.65;

  const lowShelf = offlineContext.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 120;
  lowShelf.gain.value = profile.lowShelfGain;

  const harshDip = offlineContext.createBiquadFilter();
  harshDip.type = "peaking";
  harshDip.frequency.value = 3400;
  harshDip.Q.value = 1.15;
  harshDip.gain.value = profile.harshDipGain;

  const presence = offlineContext.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 1600;
  presence.Q.value = 0.8;
  presence.gain.value = profile.presenceGain;

  const highShelf = offlineContext.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 7200;
  highShelf.gain.value = profile.highShelfGain;

  const compressor = offlineContext.createDynamicsCompressor();
  compressor.threshold.value = profile.compressorThreshold;
  compressor.knee.value = 20;
  compressor.ratio.value = profile.compressorRatio;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.18;

  const makeup = offlineContext.createGain();
  makeup.gain.value = profile.makeupGain;

  source
    .connect(highPass)
    .connect(lowShelf)
    .connect(harshDip)
    .connect(presence)
    .connect(highShelf)
    .connect(compressor)
    .connect(makeup)
    .connect(offlineContext.destination);

  source.start(0);

  const renderedBuffer = await offlineContext.startRendering();
  const leveledBuffer = applySafeTargetGain(
    renderedBuffer,
    settings.targetRmsDb,
    settings.maxPeakDb
  );
  const afterMetrics = analyzeAudioBuffer(leveledBuffer);

  return {
    buffer: leveledBuffer,
    beforeMetrics,
    afterMetrics,
    renderTimeMs: performance.now() - startedAt,
    settings: { ...settings }
  };
}

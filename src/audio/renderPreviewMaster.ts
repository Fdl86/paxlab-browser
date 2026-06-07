import {
  analyzeAdvancedAudioBuffer
} from "./advancedAnalysis";
import {
  analyzeAudioBuffer,
  applySafeTargetGain,
  clamp,
  dbToLinear,
  linearToDb
} from "./audioBufferUtils";
import { getPresetById } from "./previewPresets";
import type { PreviewRenderResult, PreviewSettings, ProcessingReport } from "./types";

interface ProcessingProfile {
  highShelfGain: number;
  harshDipGain: number;
  fizzDipGain: number;
  airGain: number;
  presenceGain: number;
  lowShelfGain: number;
  subControlFrequency: number;
  compressorThreshold: number;
  compressorRatio: number;
  makeupGain: number;
  dehissReductionDb: number;
}

interface CleanupResult {
  buffer: AudioBuffer;
  clippedSamplesDetected: number;
  clicksRepaired: number;
  declipActive: boolean;
  declickActive: boolean;
}

function getProcessingProfile(settings: PreviewSettings): ProcessingProfile {
  const amount = clamp(settings.intensity / 100, 0, 1);

  const highTreatmentGain =
    settings.highTreatment === "verySoft"
      ? -4.1
      : settings.highTreatment === "soft"
        ? -2.7
        : settings.highTreatment === "open"
          ? 1.0
          : -0.5;

  const presetWeight =
    settings.presetId === "smooth"
      ? 1.18
      : settings.presetId === "open"
        ? 0.65
        : settings.presetId === "balanced"
          ? 0.86
          : settings.presetId === "power"
            ? 0.78
            : 1;

  const powerBoost = settings.presetId === "power" ? 0.8 : 0;

  return {
    highShelfGain: highTreatmentGain * amount * presetWeight,
    harshDipGain: -2.3 * amount * presetWeight,
    fizzDipGain:
      settings.highTreatment === "verySoft"
        ? -3.2 * amount
        : settings.highTreatment === "soft"
          ? -2.0 * amount
          : settings.highTreatment === "open"
            ? -0.4 * amount
            : -1.0 * amount,
    airGain: settings.highTreatment === "open" ? 0.9 * amount : -0.35 * amount,
    presenceGain: settings.highTreatment === "open" ? 0.65 * amount : -0.45 * amount,
    lowShelfGain: settings.presetId === "open" ? -0.35 * amount : 0.45 * amount + powerBoost,
    subControlFrequency: settings.presetId === "power" ? 30 : 34,
    compressorThreshold: -23 + 8 * (1 - amount) - settings.density * 0.04,
    compressorRatio: 1.45 + 1.05 * amount + settings.density * 0.012,
    makeupGain: 1 + 0.07 * amount + settings.density * 0.0015,
    dehissReductionDb:
      settings.highTreatment === "verySoft"
        ? 2.2
        : settings.highTreatment === "soft"
          ? 1.35
          : settings.highTreatment === "open"
            ? 0.25
            : 0.75
  };
}

function createEmptyLike(source: AudioBuffer): AudioBuffer {
  return new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    sampleRate: source.sampleRate
  });
}

function cleanupInputBuffer(inputBuffer: AudioBuffer): CleanupResult {
  const output = createEmptyLike(inputBuffer);
  let clippedSamplesDetected = 0;
  let clicksRepaired = 0;

  for (let channel = 0; channel < inputBuffer.numberOfChannels; channel += 1) {
    const input = inputBuffer.getChannelData(channel);
    const data = new Float32Array(input);

    for (let index = 1; index < data.length - 1; index += 1) {
      const value = data[index];
      const previous = data[index - 1];
      const next = data[index + 1];
      const absValue = Math.abs(value);

      if (absValue >= 0.985) {
        clippedSamplesDetected += 1;
        const sign = Math.sign(value) || 1;
        const overshoot = clamp((absValue - 0.985) / 0.015, 0, 1);
        data[index] = sign * (0.985 + 0.01 * Math.tanh(overshoot));
      }

      const neighborAverage = (previous + next) * 0.5;
      const localJump = Math.abs(value - neighborAverage);
      const neighborDelta = Math.abs(previous - next);

      if (localJump > 0.42 && localJump > neighborDelta * 3.2) {
        data[index] = neighborAverage;
        clicksRepaired += 1;
      }
    }

    output.copyToChannel(data, channel);
  }

  return {
    buffer: output,
    clippedSamplesDetected,
    clicksRepaired,
    declipActive: clippedSamplesDetected > 0,
    declickActive: clicksRepaired > 0
  };
}

function applyStereoWidth(source: AudioBuffer, widthPercent: number): AudioBuffer {
  if (source.numberOfChannels < 2) {
    return source;
  }

  const output = createEmptyLike(source);
  const leftIn = source.getChannelData(0);
  const rightIn = source.getChannelData(1);
  const leftOut = output.getChannelData(0);
  const rightOut = output.getChannelData(1);
  const width = clamp(widthPercent / 100, 0.7, 1.18);

  for (let index = 0; index < source.length; index += 1) {
    const mid = (leftIn[index] + rightIn[index]) * 0.5;
    const side = (leftIn[index] - rightIn[index]) * 0.5 * width;
    leftOut[index] = clamp(mid + side, -1, 1);
    rightOut[index] = clamp(mid - side, -1, 1);
  }

  for (let channel = 2; channel < source.numberOfChannels; channel += 1) {
    output.copyToChannel(source.getChannelData(channel), channel);
  }

  return output;
}

function applyGentleDensity(source: AudioBuffer, density: number): AudioBuffer {
  const blend = clamp(density / 100, 0, 1) * 0.16;

  if (blend <= 0.001) {
    return source;
  }

  const output = createEmptyLike(source);
  const drive = 1.08 + clamp(density / 100, 0, 1) * 0.18;

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const data = output.getChannelData(channel);

    for (let index = 0; index < source.length; index += 1) {
      const clean = input[index];
      const saturated = Math.tanh(clean * drive);
      data[index] = clamp(clean * (1 - blend) + saturated * blend, -1, 1);
    }
  }

  return output;
}

function applyImprovedLimiter(source: AudioBuffer, maxPeakDb: number): { buffer: AudioBuffer; active: boolean; reductionDb: number } {
  const ceiling = dbToLinear(maxPeakDb);
  const output = createEmptyLike(source);
  let peakBefore = 0;
  let peakAfter = 0;
  let active = false;

  for (let channel = 0; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const data = output.getChannelData(channel);

    for (let index = 0; index < source.length; index += 1) {
      const sample = input[index];
      const abs = Math.abs(sample);
      peakBefore = Math.max(peakBefore, abs);

      if (abs > ceiling) {
        active = true;
        const sign = Math.sign(sample) || 1;
        const excess = abs / ceiling;
        data[index] = sign * ceiling * Math.tanh(excess) / Math.tanh(1);
      } else {
        data[index] = sample;
      }

      if (Math.abs(data[index]) > ceiling) {
        data[index] = Math.sign(data[index]) * ceiling;
      }

      peakAfter = Math.max(peakAfter, Math.abs(data[index]));
    }
  }

  const reductionDb = Math.max(0, linearToDb(peakBefore || 1e-9) - linearToDb(peakAfter || 1e-9));

  return {
    buffer: output,
    active,
    reductionDb
  };
}

function inferDehissActive(beforeHighRatio: number, profile: ProcessingProfile): boolean {
  return beforeHighRatio > 0.34 && profile.dehissReductionDb > 0.5;
}

export async function renderPreviewMaster(
  inputBuffer: AudioBuffer,
  settings: PreviewSettings
): Promise<PreviewRenderResult> {
  const startedAt = performance.now();
  const beforeMetrics = analyzeAdvancedAudioBuffer(inputBuffer);
  const profile = getProcessingProfile(settings);
  const preset = getPresetById(settings.presetId);

  const cleanup = cleanupInputBuffer(inputBuffer);

  const offlineContext = new OfflineAudioContext(
    cleanup.buffer.numberOfChannels,
    cleanup.buffer.length,
    cleanup.buffer.sampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = cleanup.buffer;

  const highPass = offlineContext.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = profile.subControlFrequency;
  highPass.Q.value = 0.7;

  const lowShelf = offlineContext.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 115;
  lowShelf.gain.value = profile.lowShelfGain;

  const lowMudDip = offlineContext.createBiquadFilter();
  lowMudDip.type = "peaking";
  lowMudDip.frequency.value = 320;
  lowMudDip.Q.value = 0.9;
  lowMudDip.gain.value = settings.presetId === "power" ? -0.4 : -0.9;

  const presence = offlineContext.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = 1700;
  presence.Q.value = 0.8;
  presence.gain.value = profile.presenceGain;

  const harshDip = offlineContext.createBiquadFilter();
  harshDip.type = "peaking";
  harshDip.frequency.value = 3600;
  harshDip.Q.value = 1.25;
  harshDip.gain.value = profile.harshDipGain;

  const brightnessDip = offlineContext.createBiquadFilter();
  brightnessDip.type = "peaking";
  brightnessDip.frequency.value = 7200;
  brightnessDip.Q.value = 1.05;
  brightnessDip.gain.value = profile.highShelfGain * 0.58;

  const fizzDip = offlineContext.createBiquadFilter();
  fizzDip.type = "peaking";
  fizzDip.frequency.value = 11200;
  fizzDip.Q.value = 1.15;
  fizzDip.gain.value = profile.fizzDipGain;

  const highShelf = offlineContext.createBiquadFilter();
  highShelf.type = "highshelf";
  highShelf.frequency.value = 14500;
  highShelf.gain.value = profile.airGain - profile.dehissReductionDb * 0.35;

  const compressor = offlineContext.createDynamicsCompressor();
  compressor.threshold.value = profile.compressorThreshold;
  compressor.knee.value = 22;
  compressor.ratio.value = profile.compressorRatio;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.19;

  const makeup = offlineContext.createGain();
  makeup.gain.value = profile.makeupGain;

  source
    .connect(highPass)
    .connect(lowShelf)
    .connect(lowMudDip)
    .connect(presence)
    .connect(harshDip)
    .connect(brightnessDip)
    .connect(fizzDip)
    .connect(highShelf)
    .connect(compressor)
    .connect(makeup)
    .connect(offlineContext.destination);

  source.start(0);

  const renderedBuffer = await offlineContext.startRendering();
  const stereoBuffer = applyStereoWidth(renderedBuffer, settings.stereoWidth);
  const densityBuffer = applyGentleDensity(stereoBuffer, settings.density);
  const preGainMetrics = analyzeAudioBuffer(densityBuffer);
  const leveledBuffer = applySafeTargetGain(
    densityBuffer,
    settings.targetRmsDb,
    settings.maxPeakDb
  );
  const limiter = applyImprovedLimiter(leveledBuffer, settings.maxPeakDb);
  const afterMetrics = analyzeAdvancedAudioBuffer(limiter.buffer);

  const gainAppliedDb = afterMetrics.rmsDb - preGainMetrics.rmsDb;
  const dehissActive = inferDehissActive(beforeMetrics.highTotalRatio, profile);
  const antiFizzReductionDb =
    Math.abs(profile.highShelfGain * 0.58) + Math.abs(profile.fizzDipGain) + profile.dehissReductionDb * 0.35;

  const appliedMoves: string[] = [];
  if (cleanup.declipActive) {
    appliedMoves.push("de-clipper prudent");
  }
  if (cleanup.declickActive) {
    appliedMoves.push("de-clicker micro-clics");
  }
  if (dehissActive) {
    appliedMoves.push("de-hiss aigu léger");
  }
  if (antiFizzReductionDb > 0.8) {
    appliedMoves.push("anti-fizz / contrôle des aigus");
  }
  if (Math.abs(profile.lowShelfGain) > 0.2 || profile.subControlFrequency > 30) {
    appliedMoves.push("contrôle sub et bas du spectre");
  }
  if (settings.stereoWidth !== 100) {
    appliedMoves.push("EQ M/S simplifiée et largeur stéréo");
  }
  if (settings.density > 0) {
    appliedMoves.push("densité harmonique douce");
  }
  appliedMoves.push("compression douce");
  appliedMoves.push("standardisation de niveau estimée");
  if (limiter.active) {
    appliedMoves.push("limiteur de sécurité");
  }

  const renderTimeMs = performance.now() - startedAt;
  const report: ProcessingReport = {
    profileLabel: preset.label,
    brightnessLabel:
      settings.highTreatment === "verySoft"
        ? "Très douce"
        : settings.highTreatment === "soft"
          ? "Plus douce"
          : settings.highTreatment === "open"
            ? "Plus ouverte"
            : "Naturelle",
    targetLabel: "-13 LUFS estimé / RMS indicatif",
    appliedMoves,
    cleanup: {
      declipActive: cleanup.declipActive,
      declickActive: cleanup.declickActive,
      dehissActive,
      clippedSamplesDetected: cleanup.clippedSamplesDetected,
      clicksRepaired: cleanup.clicksRepaired,
      dehissReductionDb: dehissActive ? profile.dehissReductionDb : 0
    },
    tone: {
      antiFizzActive: antiFizzReductionDb > 0.8,
      antiFizzReductionDb,
      subControlActive: profile.subControlFrequency > 30,
      stereoControlActive: settings.stereoWidth !== 100,
      densityActive: settings.density > 0,
      compressionActive: true
    },
    loudness: {
      gainAppliedDb,
      targetRmsDb: settings.targetRmsDb,
      targetLufsEstimate: -13,
      limiterActive: limiter.active,
      limiterReductionDb: limiter.reductionDb
    },
    performance: {
      renderTimeMs
    }
  };

  return {
    buffer: limiter.buffer,
    beforeMetrics,
    afterMetrics,
    renderTimeMs,
    settings: { ...settings },
    report
  };
}

import { applyGainToNewBuffer, dbToLinear } from "../src/audio/audioBufferUtils";
import { applyLinkedLookaheadLimiter } from "../src/audio/audioSafety";
import { applyStereoSpace, applyStereoWidth } from "../src/audio/stereoProcessing";
import { getSettingsForPreset } from "../src/audio/previewPresets";

class TestAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly duration: number;
  private readonly channels: Float32Array[];

  constructor(options: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.duration = options.length / options.sampleRate;
    this.channels = Array.from(
      { length: options.numberOfChannels },
      () => new Float32Array(options.length)
    );
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) {
      throw new Error(`Canal invalide: ${channel}`);
    }
    return data;
  }

  copyToChannel(source: Float32Array, channel: number, startInChannel = 0): void {
    this.getChannelData(channel).set(source, startInChannel);
  }
}

(globalThis as unknown as { AudioBuffer: typeof AudioBuffer }).AudioBuffer = TestAudioBuffer as unknown as typeof AudioBuffer;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function createBuffer(channels: number, length = 4096, sampleRate = 48000): AudioBuffer {
  return new TestAudioBuffer({ numberOfChannels: channels, length, sampleRate }) as unknown as AudioBuffer;
}

function maxAbs(data: Float32Array): number {
  let peak = 0;
  for (const sample of data) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

function testUnclampedGain(): void {
  const source = createBuffer(1, 4);
  source.getChannelData(0).set([0.8, -0.75, 0.25, 0]);
  const gained = applyGainToNewBuffer(source, 2);

  assert(Math.abs(gained.getChannelData(0)[0] - 1.6) < 1e-6, "Le gain intermédiaire ne doit pas clipper à +1.");
  assert(Math.abs(gained.getChannelData(0)[1] + 1.5) < 1e-6, "Le gain intermédiaire ne doit pas clipper à -1.");
}

function testLinkedLimiterCeilingAndStereoLink(): void {
  const source = createBuffer(2, 8192);
  const left = source.getChannelData(0);
  const right = source.getChannelData(1);

  for (let index = 0; index < source.length; index += 1) {
    const sample = 1.35 * Math.sin((2 * Math.PI * 997 * index) / source.sampleRate);
    left[index] = sample;
    right[index] = sample * 0.5;
  }

  const ceilingDb = -1;
  const ceiling = dbToLinear(ceilingDb);
  const limited = applyLinkedLookaheadLimiter(source, ceilingDb);
  const outLeft = limited.buffer.getChannelData(0);
  const outRight = limited.buffer.getChannelData(1);

  assert(limited.stats.active, "Le limiteur doit être actif sur un signal au-dessus du ceiling.");
  assert(limited.stats.samplesAboveCeiling > 0, "Les dépassements doivent être comptés.");
  assert(maxAbs(outLeft) <= ceiling + 1e-6, "Le canal gauche doit respecter le ceiling.");
  assert(maxAbs(outRight) <= ceiling + 1e-6, "Le canal droit doit respecter le ceiling.");

  let testIndex = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (Math.abs(left[index]) > 1.2) {
      testIndex = index;
      break;
    }
  }

  const ratio = Math.abs(outLeft[testIndex] / Math.max(Math.abs(outRight[testIndex]), 1e-9));
  assert(Math.abs(ratio - 2) < 0.01, "Le gain de réduction doit être lié entre gauche et droite.");
}

function testBelowCeilingIsTransparent(): void {
  const source = createBuffer(1, 4096);
  const input = source.getChannelData(0);

  for (let index = 0; index < source.length; index += 1) {
    input[index] = 0.45 * Math.sin((2 * Math.PI * 440 * index) / source.sampleRate);
  }

  const limited = applyLinkedLookaheadLimiter(source, -1);
  const output = limited.buffer.getChannelData(0);
  let maxDifference = 0;

  for (let index = 0; index < source.length; index += 1) {
    maxDifference = Math.max(maxDifference, Math.abs(input[index] - output[index]));
  }

  assert(!limited.stats.active, "Le limiteur doit rester inactif sous le ceiling.");
  assert(maxDifference < 1e-7, "Un signal sous le ceiling doit rester transparent.");
}

function testNonFiniteProtection(): void {
  const source = createBuffer(2, 32);
  source.getChannelData(0)[3] = Number.NaN;
  source.getChannelData(1)[7] = Number.POSITIVE_INFINITY;
  source.getChannelData(0)[12] = 1.4;

  const limited = applyLinkedLookaheadLimiter(source, -1);
  assert(limited.stats.nonFiniteSamples === 2, "Les valeurs non finies doivent être détectées.");

  for (let channel = 0; channel < limited.buffer.numberOfChannels; channel += 1) {
    for (const sample of limited.buffer.getChannelData(channel)) {
      assert(Number.isFinite(sample), "La sortie ne doit contenir ni NaN ni Infinity.");
    }
  }
}

function testStereoStagesDoNotHardClip(): void {
  const source = createBuffer(2, 2048);
  const left = source.getChannelData(0);
  const right = source.getChannelData(1);

  for (let index = 0; index < source.length; index += 1) {
    const side = 0.92 * Math.sin((2 * Math.PI * 2500 * index) / source.sampleRate);
    left[index] = side;
    right[index] = -side;
  }

  const widened = applyStereoWidth(source, 118, 0.25);
  const spaced = applyStereoSpace(widened, true);

  assert(maxAbs(widened.getChannelData(0)) > 1, "La largeur stéréo ne doit plus hard-clipper en interne.");
  assert(maxAbs(spaced.getChannelData(0)) > 1, "Espace stéréo ne doit plus hard-clipper en interne.");

  const limited = applyLinkedLookaheadLimiter(spaced, -1.2);
  const ceiling = dbToLinear(-1.2);
  assert(maxAbs(limited.buffer.getChannelData(0)) <= ceiling + 1e-6, "Le limiteur final doit sécuriser le M/S.");
  assert(maxAbs(limited.buffer.getChannelData(1)) <= ceiling + 1e-6, "Le limiteur final doit sécuriser les deux canaux.");
}

function testLimiterAvoidsHardClipPlateau(): void {
  const source = createBuffer(1, 8192);
  const input = source.getChannelData(0);
  const ceiling = dbToLinear(-1);

  for (let index = 0; index < source.length; index += 1) {
    input[index] = 1.45 * Math.sin((2 * Math.PI * 997 * index) / source.sampleRate);
  }

  const limited = applyLinkedLookaheadLimiter(source, -1).buffer.getChannelData(0);
  let hardClipSamples = 0;
  let linkedCeilingSamples = 0;

  for (let index = 0; index < input.length; index += 1) {
    if (Math.abs(input[index]) >= ceiling) {
      hardClipSamples += 1;
    }
    if (Math.abs(Math.abs(limited[index]) - ceiling) < 1e-7) {
      linkedCeilingSamples += 1;
    }
  }

  assert(linkedCeilingSamples < hardClipSamples * 0.2, "Le limiteur lié ne doit pas créer un plateau de hard clipping.");
}


function testPresetTargetsRemainStable(): void {
  const expected = {
    smooth: { targetLufsEstimate: -13.4, maxPeakDb: -2.4 },
    balanced: { targetLufsEstimate: -12.2, maxPeakDb: -1.5 },
    power: { targetLufsEstimate: -11.2, maxPeakDb: -1.2 },
    youtube: { targetLufsEstimate: -14.4, maxPeakDb: -1.8 }
  } as const;

  for (const [presetId, values] of Object.entries(expected)) {
    const settings = getSettingsForPreset(presetId as keyof typeof expected);
    assert(settings.targetLufsEstimate === values.targetLufsEstimate, `${presetId}: cible LUFS modifiee.`);
    assert(settings.maxPeakDb === values.maxPeakDb, `${presetId}: ceiling modifie.`);
  }

  const youtubeWithOptions = {
    ...getSettingsForPreset("youtube"),
    stereoSpace: true,
    bassPunch: true
  };
  assert(youtubeWithOptions.stereoSpace && youtubeWithOptions.bassPunch, "Les options stereo + bass doivent rester combinables.");

  const smoothWithBass = {
    ...getSettingsForPreset("smooth"),
    bassPunch: true
  };
  assert(smoothWithBass.antiFatigue && smoothWithBass.bassPunch, "AI Brightness et Basses punchy doivent rester compatibles.");
}

const tests: Array<[string, () => void]> = [
  ["gain intermédiaire sans clamp", testUnclampedGain],
  ["limiteur lié et ceiling", testLinkedLimiterCeilingAndStereoLink],
  ["transparence sous le ceiling", testBelowCeilingIsTransparent],
  ["protection NaN / Infinity", testNonFiniteProtection],
  ["M/S sans hard clip intermédiaire", testStereoStagesDoNotHardClip],
  ["absence de plateau hard clip", testLimiterAvoidsHardClipPlateau],
  ["cibles presets et compatibilites", testPresetTargetsRemainStable]
];

for (const [name, test] of tests) {
  test();
  console.log(`OK - ${name}`);
}

console.log(`DSP safety tests: ${tests.length}/${tests.length} OK`);

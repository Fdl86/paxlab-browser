import { clamp } from "./audioBufferUtils";

function createEmptyLike(source: AudioBuffer): AudioBuffer {
  return new AudioBuffer({
    numberOfChannels: source.numberOfChannels,
    length: source.length,
    sampleRate: source.sampleRate
  });
}

function safeSample(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function applyStereoWidth(
  source: AudioBuffer,
  widthPercent: number,
  sourceStereoRatio?: number
): AudioBuffer {
  if (source.numberOfChannels < 2) {
    return source;
  }

  const output = createEmptyLike(source);
  const leftIn = source.getChannelData(0);
  const rightIn = source.getChannelData(1);
  const leftOut = output.getChannelData(0);
  const rightOut = output.getChannelData(1);
  const baseWidth = clamp(widthPercent / 100, 0.7, 1.18);
  const safetyFactor = sourceStereoRatio === undefined
    ? 1
    : sourceStereoRatio > 0.6
      ? 0.7
      : sourceStereoRatio > 0.45
        ? 0.85
        : 1;
  const width = baseWidth > 1 ? 1 + (baseWidth - 1) * safetyFactor : baseWidth;

  for (let index = 0; index < source.length; index += 1) {
    const left = safeSample(leftIn[index]);
    const right = safeSample(rightIn[index]);
    const mid = (left + right) * 0.5;
    const side = (left - right) * 0.5 * width;

    // Aucun clamp intermédiaire. Le limiteur lié final gère les crêtes.
    leftOut[index] = mid + side;
    rightOut[index] = mid - side;
  }

  for (let channel = 2; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const data = output.getChannelData(channel);

    for (let index = 0; index < source.length; index += 1) {
      data[index] = safeSample(input[index]);
    }
  }

  return output;
}

export function applyStereoSpace(source: AudioBuffer, enabled: boolean): AudioBuffer {
  if (!enabled || source.numberOfChannels < 2) {
    return source;
  }

  const output = createEmptyLike(source);
  const leftIn = source.getChannelData(0);
  const rightIn = source.getChannelData(1);
  const leftOut = output.getChannelData(0);
  const rightOut = output.getChannelData(1);
  const sideLift = 0.14;
  const highPassFrequency = 220;
  const rc = 1 / (2 * Math.PI * highPassFrequency);
  const dt = 1 / source.sampleRate;
  const alpha = rc / (rc + dt);
  let previousSide = 0;
  let previousHighSide = 0;

  for (let index = 0; index < source.length; index += 1) {
    const left = safeSample(leftIn[index]);
    const right = safeSample(rightIn[index]);
    const mid = (left + right) * 0.5;
    const side = (left - right) * 0.5;
    const highSide = alpha * (previousHighSide + side - previousSide);
    const wideSide = side + highSide * sideLift;

    // Les graves restent protégés par le passe-haut du canal Side.
    // Aucun clamp intermédiaire afin de préserver les transitoires.
    leftOut[index] = mid + wideSide;
    rightOut[index] = mid - wideSide;
    previousSide = side;
    previousHighSide = highSide;
  }

  for (let channel = 2; channel < source.numberOfChannels; channel += 1) {
    const input = source.getChannelData(channel);
    const data = output.getChannelData(channel);

    for (let index = 0; index < source.length; index += 1) {
      data[index] = safeSample(input[index]);
    }
  }

  return output;
}

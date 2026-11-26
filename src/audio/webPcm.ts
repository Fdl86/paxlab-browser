// Parse RIFF chunks conservatively; only unmodified, native PCM16 stereo 48 kHz is eligible for detection.
export function wavInfo(raw: ArrayBuffer) {
  const v = new DataView(raw);
  const tag = (p: number) => String.fromCharCode(...new Uint8Array(raw, p, 4));
  if (v.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  let format = 0, channels = 0, rate = 0, bits = 0, align = 0, offset = -1, size = 0;
  const end = Math.min(v.byteLength, 8 + v.getUint32(4, true));
  for (let p = 12; p + 8 <= end;) {
    const n = v.getUint32(p + 4, true), start = p + 8;
    if (n > end - start) return null;
    if (tag(p) === 'fmt ' && n >= 16) {
      format = v.getUint16(start, true); channels = v.getUint16(start + 2, true); rate = v.getUint32(start + 4, true); align = v.getUint16(start + 12, true); bits = v.getUint16(start + 14, true);
      if (format === 65534 && n >= 40) {
        const guid = Array.from(new Uint8Array(raw, start + 24, 16));
        const tail = [0,0,0,0,16,0,128,0,0,170,0,56,155,113];
        if (guid.slice(2).every((b,i)=>b===tail[i])) format = v.getUint16(start+24,true);
      }
    } else if (tag(p) === 'data' && offset < 0) { offset = start; size = n; }
    p = start + n + (n & 1);
  }
  if (!channels || !rate || !align || offset < 0 || size % align !== 0) return null;
  return {format,channels,rate,bits,align,offset,size};
}
export function detectorPcm(raw: ArrayBuffer, name: string): ArrayBuffer | null {
  const w = wavInfo(raw);
  return name.toLowerCase().endsWith('.wav') && w && w.format === 1 && w.channels === 2 && w.rate === 48000 && w.bits === 16 && w.align === 4 && w.size >= 48000 * 20 * 4 ? raw.slice(w.offset,w.offset+w.size) : null;
}
export function interleave(buffer: AudioBuffer): ArrayBuffer {
  const pcm = new Float32Array(buffer.length * buffer.numberOfChannels);
  for (let c=0;c<buffer.numberOfChannels;c++) { const data=buffer.getChannelData(c); for(let i=0;i<data.length;i++) pcm[i*buffer.numberOfChannels+c]=data[i]; }
  return pcm.buffer;
}
export function audioFromPcm(raw: ArrayBuffer, rate: number, channels: number): AudioBuffer {
  const samples = new Float32Array(raw);
  if (!samples.length || samples.length % channels) throw new Error('Invalid PCM');
  const b = new AudioBuffer({length:samples.length/channels, sampleRate:rate, numberOfChannels:channels});
  for(let c=0;c<channels;c++){ const data=b.getChannelData(c); for(let i=0;i<data.length;i++) data[i]=samples[i*channels+c]; }
  return b;
}
export async function decodeNative(raw: ArrayBuffer): Promise<AudioBuffer> {
  const w=wavInfo(raw);
  if(w && (w.format===1 && [16,24,32].includes(w.bits) || w.format===3 && w.bits===32) && w.align===w.channels*w.bits/8){
    if(w.channels>2 || w.rate<8000 || w.rate>192000 || w.size/w.align/w.rate>900 || w.size/w.align*w.channels*4>192*1024*1024) throw new Error('Size or format');
    const v=new DataView(raw), samples=new Float32Array(w.size/(w.bits/8));
    for(let i=0,p=w.offset;i<samples.length;i++,p+=w.bits/8){
      samples[i]=w.format===3?v.getFloat32(p,true):w.bits===16?v.getInt16(p,true)/32768:w.bits===32?v.getInt32(p,true)/2147483648:((v.getUint8(p)|v.getUint8(p+1)<<8|v.getInt8(p+2)<<16))/8388608;
    }
    return audioFromPcm(samples.buffer,w.rate,w.channels);
  }
  // Compressed formats are decoded locally at the browser's 48 kHz processing rate.
  const ctx=new OfflineAudioContext(2,1,48000);
  const b=await ctx.decodeAudioData(raw.slice(0));
  if(b.numberOfChannels>2 || b.duration>900 || b.length*b.numberOfChannels*4>192*1024*1024) throw new Error('Size or format');
  return b;
}

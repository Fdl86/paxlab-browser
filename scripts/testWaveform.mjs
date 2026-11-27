import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'pax-wave-'));
try {
  const tsc=process.platform==='win32'?'tsc.cmd':'tsc';
  const opt={encoding:'utf8',shell:process.platform==='win32'};
  const version=spawnSync(tsc,['--version'],opt).stdout??'';
  const r=spawnSync(tsc,[...(version.includes('Version 6.')?['--ignoreConfig']:[]),'src/audio/waveformView.ts','--target','ES2020','--module','ES2020','--strict','--skipLibCheck','--typeRoots',join(dir,'types'),'--outDir',dir],{stdio:'inherit',shell:process.platform==='win32'});
  assert.equal(r.status,0);writeFileSync(join(dir,'package.json'),'{"type":"module"}');
  const {buildWaveformBins:bins,buildWaveformRects:rects,getCachedWaveformBins:cached,residualDisplayAmplitude:a}=await import(pathToFileURL(join(dir,'waveformView.js')).href);
  const fake=(...channels)=>({length:channels[0].length,numberOfChannels:channels.length,duration:channels[0].length/48000,getChannelData:i=>channels[i]});
  const db=v=>10**(v/20);
  const residual=(buffer,count=4,ref=null)=>bins(buffer,ref,count,'residual');
  const draw=b=>rects(b,860,110,50,'residual');
  const silent=fake(new Float32Array(400));
  assert.equal(draw(residual(silent)).length,0);
  assert.equal(a(0),0);assert.equal(a(db(-100)),0);assert.equal(a(db(-90)),0);
  assert.ok(Math.abs(a(db(-55))-.5)<1e-12);assert.equal(a(db(-20)),1);assert.equal(a(1),1);
  assert.equal(a(NaN),0);
  const left=new Float32Array(403),right=new Float32Array(403);
  left[110]=db(-55);right[402]=db(-40); // Stereo peak and the very last sample must be included.
  const source=fake(left,right),b=residual(source);
  assert.equal(b.length,4);assert.equal(b[0].max,0);assert.equal(b[2].max,0);
  assert.ok(Math.abs(b[1].max-.5)<1e-7);assert.ok(Math.abs(b[3].max-50/70)<1e-7);
  const bars=draw(b);assert.equal(bars.length,2);assert.ok(bars[0].x>215&&bars[0].x<430);assert.ok(bars[1].x>645);
  assert.deepEqual(residual(source,4,fake(Float32Array.from({length:403},()=>.5))),b);
  const before=left.slice();const cache=cached(source,null,'residual');assert.strictEqual(cached(source,silent,'residual'),cache);
  assert.notStrictEqual(cached(source,null,'structure'),cache);assert.deepEqual(left,before);
  assert.ok(rects(bins(silent,silent,4)).every(r=>r.height>=6));
  assert.equal(residual(fake(Float32Array.of(.1)),420).length,1);
  console.log('Waveform: silent bins, fixed dBFS scale, isolated peaks, stereo, final sample, cache separation, input unchanged and legacy mode passed.');
} finally {rmSync(dir,{recursive:true,force:true});}

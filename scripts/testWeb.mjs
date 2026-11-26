import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,rmSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const out='.web-test-build';
const tsc=existsSync('node_modules/typescript/bin/tsc')?['node',['node_modules/typescript/bin/tsc']]:['tsc',[]];
const version=spawnSync(tsc[0],[...tsc[1],'--version'],{encoding:'utf8'}).stdout;
const args=[...tsc[1],...(version?.includes('Version 6.')?['--ignoreConfig']:[]),'src/audio/webPcm.ts','src/i18n.ts','--target','ES2022','--module','commonjs','--lib','ES2022,DOM','--strict','--skipLibCheck','--types','node','--outDir',out];
// No Node typings are needed by these source modules; use an empty typeRoots.
args.splice(args.indexOf('--types'),2,'--typeRoots','./scripts/empty-types');
try{
  const r=spawnSync(tsc[0],args,{stdio:'inherit'});if(r.status!==0)throw Error('TypeScript compilation failed');
  writeFileSync(`${out}/package.json`,'{"type":"commonjs"}');
  const req=createRequire(import.meta.url);const {wavInfo,detectorPcm}=req(`../${out}/audio/webPcm.js`);const {messages}=req(`../${out}/i18n.js`);
  assert.deepEqual(Object.keys(messages.fr).sort(),Object.keys(messages.en).sort());
  assert.ok(Object.values(messages.en).every(v=>typeof v==='string'&&v.length));
  function wav(seconds=20,rate=48000,channels=2,bits=16){const n=seconds*rate*channels*bits/8,b=new ArrayBuffer(44+n),v=new DataView(b);function tag(p,s){[...s].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));}tag(0,'RIFF');v.setUint32(4,36+n,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*bits/8,true);v.setUint16(32,channels*bits/8,true);v.setUint16(34,bits,true);tag(36,'data');v.setUint32(40,n,true);return b;}
  const raw=wav();assert.equal(wavInfo(raw).rate,48000);assert.equal(detectorPcm(raw,'music.WAV').byteLength,48000*20*4);assert.equal(detectorPcm(raw,'music.flac'),null);assert.equal(detectorPcm(wav(19),'music.wav'),null);assert.equal(detectorPcm(wav(20,44100),'music.wav'),null);assert.equal(detectorPcm(wav(20,48000,1),'music.wav'),null);assert.equal(detectorPcm(wav(20,48000,2,24),'music.wav'),null);assert.equal(wavInfo(raw.slice(0,50)),null);
  console.log('Web: translation keys and 8 WAV parser checks passed.');
}finally{rmSync(out,{recursive:true,force:true});}

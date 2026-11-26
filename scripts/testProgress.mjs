import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
// Test the real client dispatch logic without needing a browser or the WASM SDK.
const dir=mkdtempSync(join(tmpdir(),'pax-progress-'));
try{
  const original=readFileSync('src/audio/wasmClient.ts','utf8');
  writeFileSync(join(dir,'client.ts'),original.replace('import.meta.env.BASE_URL','"./"'));
  const tsc=process.platform==='win32'?'tsc.cmd':'tsc';
  const opts={encoding:'utf8',shell:process.platform==='win32'};
  const version=spawnSync(tsc,['--version'],opts).stdout??'';
  const r=spawnSync(tsc,[...(version.includes('Version 6.')?['--ignoreConfig']:[]),join(dir,'client.ts'),'--target','ES2022','--module','ES2022','--lib','ES2022,DOM','--strict','--skipLibCheck','--typeRoots',join(dir,'types'),'--outDir',dir],{stdio:'inherit',shell:process.platform==='win32'});
  assert.equal(r.status,0);
  writeFileSync(join(dir,'package.json'),'{"type":"module"}');
  const {EngineClient,renderStages}=await import(pathToFileURL(join(dir,'client.js')).href);
  let worker;
  globalThis.Worker=class{constructor(){worker=this;}postMessage(data){this.request=data;}terminate(){this.terminated=true;}emit(data){this.onmessage({data});}};
  const client=new EngineClient(), seen=[];
  let settled=false;
  const result=client.request('render',{},[],s=>seen.push(s)).then(r=>{settled=true;return r;});
  const id=worker.request.id;
  worker.emit({id:id+1,progress:'stagePlan'});
  worker.emit({id,progress:'unknown'});
  worker.emit({id,progress:'stagePlan'});
  worker.emit({id,progress:'stageSpectrum'});
  await Promise.resolve();assert.equal(settled,false);assert.deepEqual(seen,['stagePlan','stageSpectrum']);
  worker.emit({id,pcm:new ArrayBuffer(8)});assert.equal((await result).pcm.byteLength,8);
  worker.emit({id,progress:'stageTransfer'});assert.equal(seen.length,2);
  const failed=client.request('render',{},[],()=>{});worker.emit({id:worker.request.id,error:true});await assert.rejects(failed);
  const lost=client.request('render',{});worker.onmessageerror();await assert.rejects(lost);assert.ok(worker.terminated);
  const cs=readFileSync('engine/Program.cs','utf8');const js=readFileSync('public/mastering-worker.js','utf8');const translations=readFileSync('src/i18n.ts','utf8');
  for(const [,stage] of (cs+js).matchAll(/["'](stage[A-Z]\w+)["']/g))assert.ok(renderStages.includes(stage),`Unrecognized stage ${stage}`);
  for(const stage of renderStages)assert.equal((translations.match(new RegExp(`\\b${stage}:`,'g'))??[]).length,2,`Missing FR/EN stage ${stage}`);
  console.log('Progress: request isolation, live events, completion, errors, worker disposal, stage contracts and FR/EN keys passed.');
}finally{rmSync(dir,{recursive:true,force:true});}

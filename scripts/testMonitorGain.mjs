import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const dir=mkdtempSync(join(tmpdir(),'pax-monitor-'));
try {
  const tsc=process.platform==='win32'?'tsc.cmd':'tsc';
  const opt={encoding:'utf8',shell:process.platform==='win32'};
  const version=spawnSync(tsc,['--version'],opt).stdout??'';
  const r=spawnSync(tsc,[...(version.includes('Version 6.')?['--ignoreConfig']:[]),'src/audio/monitorGain.ts','--target','ES2020','--module','ES2020','--strict','--skipLibCheck','--typeRoots',join(dir,'types'),'--outDir',dir],{stdio:'inherit',shell:process.platform==='win32'});
  assert.equal(r.status,0);writeFileSync(join(dir,'package.json'),' {"type":"module"}');
  const {monitorGains:g}=await import(pathToFileURL(join(dir,'monitorGain.js')).href);
  assert.deepEqual(g(100,true,-16,-14,false),{original:0,preview:-2});
  assert.deepEqual(g(100,true,-14,-16,false),{original:-2,preview:0});
  assert.deepEqual(g(100,true,-14,-16,true),{original:-2,preview:0});
  assert.deepEqual(g(100,true,-16,-14,true),{original:0,preview:0});
  assert.deepEqual(g(100,false,-16,-14,false),{original:0,preview:0});
  assert.deepEqual(g(0,true,-16,-14,false),{original:-Infinity,preview:-Infinity});
  assert.deepEqual(g(100,true,-Infinity,-14,false),{original:0,preview:0});
  assert.deepEqual(g(100,true,'-Infinity',-14,false),{original:0,preview:0});
  assert.ok(Math.abs(g(50,false,-16,-14,false).original+6.020599913)<1e-8);
  assert.deepEqual(g(200,false,-16,-14,false),{original:0,preview:0});
  console.log('Monitoring gain: 10/10 checks passed (attenuation only, residual, mute, invalid measurements).');
} finally {rmSync(dir,{recursive:true,force:true});}

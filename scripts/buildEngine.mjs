import {spawnSync} from 'node:child_process';
import {cpSync,rmSync,existsSync,readdirSync,mkdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
// Explicit opt-out for constrained build environments, never a silent fallback.
const aot=process.env.PAXLAB_WASM_AOT!=='0';
console.log(`PAXLAB WebAssembly: ${aot?'AOT':'interpreter (explicit opt-out)'}`);
// Never deploy a stale build or a pre-publish interpreter bundle.
rmSync('engine/bin/Release',{recursive:true,force:true});
const r=spawnSync('dotnet',['publish','engine/Paxlab.Web.csproj','-c','Release',`-p:RunAOTCompilation=${aot}`],{stdio:'inherit'});
if(r.error)throw r.error;
if(r.status!==0)process.exit(r.status||1);
function locate(dir,found=[]){
  if(existsSync(join(dir,'_framework','dotnet.js')))found.push(dir);
  for(const e of readdirSync(dir,{withFileTypes:true}))if(e.isDirectory()&&e.name!=='_framework')locate(join(dir,e.name),found);
  return found;
}
const candidates=locate('engine/bin/Release');
const published=candidates.filter(p=>p.split(/[\\/]/).includes('publish'));
const bundles=published.length?published:candidates;
if(bundles.length!==1)throw Error(`Expected a single WASM publish bundle, found: ${bundles.join(', ')||'none'}`);
const framework=join(bundles[0],'_framework');
// Cloudflare Pages has a 25 MiB per-file limit. Fail with an actionable message.
function verifySize(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())verifySize(p);else if(statSync(p).size>25*1024*1024)throw Error(`Cloudflare Pages asset exceeds 25 MiB: ${p}. Build with PAXLAB_WASM_AOT=0 or deploy elsewhere.`);}}
if(process.env.CF_PAGES==='1')verifySize(framework);
console.log(`Copying published WASM from ${framework}`);
rmSync('public/engine',{recursive:true,force:true});mkdirSync('public/engine',{recursive:true});cpSync(framework,'public/engine/_framework',{recursive:true});

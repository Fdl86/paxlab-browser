import {spawnSync} from 'node:child_process';
import {cpSync,rmSync,existsSync,readdirSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
const r=spawnSync('dotnet',['publish','engine/Paxlab.Web.csproj','-c','Release'],{stdio:'inherit'});
if(r.status!==0)process.exit(r.status||1);
function locate(dir){if(existsSync(join(dir,'_framework','dotnet.js')))return dir;for(const e of readdirSync(dir,{withFileTypes:true})){if(e.isDirectory()){const p=locate(join(dir,e.name));if(p)return p;}}}
const path=locate('engine/bin/Release');if(!path)throw Error('WASM runtime not found');
rmSync('public/engine',{recursive:true,force:true});mkdirSync('public/engine',{recursive:true});cpSync(join(path,'_framework'),'public/engine/_framework',{recursive:true});

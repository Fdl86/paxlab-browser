import {useEffect,useMemo,useRef,useState} from 'react';
import {messages,type Language} from './i18n';
import {EngineClient,type Diagnostic,type Metrics,type RenderReport,type RenderStage} from './audio/wasmClient';
import {audioFromPcm,decodeNative,detectorPcm,interleave} from './audio/webPcm';
import {encodeWavFromAudioBuffer,buildSafeAudioFilename} from './audio/exportWav';
import {encodeFlacFromAudioBuffer} from './audio/exportFlac';
import {useABAudioPlayer} from './audio/useABAudioPlayer';
import {buildWaveformRects,getCachedWaveformBins} from './audio/waveformView';

type Key=keyof typeof messages.fr;
type Mode=''|'v55'|'v6';
type Monitor='result'|'difference'|'removed';
const defaults={preset:'youtube',rider:'auto',riderProfile:'equilibre',level:'off',masterB:false,antiFatigue:false,vocalPresence:false,stereoSpace:false,bassPunch:false,spacePreserve:false};
type Prefs=typeof defaults;
const storage='paxlab-web-3.3';
function read<T>(key:string,fallback:T):T{try{const v=localStorage.getItem(`${storage}:${key}`);return v?JSON.parse(v) as T:fallback;}catch{return fallback;}}
function write(key:string,v:unknown){try{localStorage.setItem(`${storage}:${key}`,JSON.stringify(v));}catch{/* private browsing */}}
function initialPrefs():Prefs{const p=read<Partial<Prefs>>('prefs',{});const result={...defaults};for(const k of ['masterB','antiFatigue','vocalPresence','stereoSpace','bassPunch','spacePreserve'] as const)if(typeof p?.[k]==='boolean')result[k]=p[k]!;for(const [k,values] of [['preset',['safe','balanced','impact','youtube','smooth','open']],['rider',['off','auto','forced']],['riderProfile',['conservateur','equilibre','correctif']],['level',['off','doux','progressif']]] as const){if(typeof p?.[k]==='string'&&(values as readonly string[]).includes(p[k]!))result[k]=p[k]!;}if(result.antiFatigue||result.bassPunch)result.vocalPresence=false;return result;}
// Native modal traps focus and blocks interactions while the worker owns the render.
function MasteringDialog({t,stage,started}:{t:typeof messages[Language];stage:RenderStage;started:number}){
  const dialog=useRef<HTMLDialogElement>(null);
  const [elapsed,setElapsed]=useState(()=>Math.max(0,(performance.now()-started)/1000));
  useEffect(()=>{
    const el=dialog.current;
    if(el&&!el.open)el.showModal();
    const tick=()=>setElapsed(Math.max(0,(performance.now()-started)/1000));
    tick();const timer=window.setInterval(tick,250);
    return()=>{window.clearInterval(timer);if(el?.open)el.close();};
  },[started]);
  return <dialog ref={dialog} className="web-mastering-dialog" aria-labelledby="mastering-title" aria-describedby="mastering-detail" onCancel={e=>e.preventDefault()}>
    <p className="eyebrow">PAXLAB WEB 3.3</p>
    <h2 id="mastering-title">{t.render}</h2>
    <p className="web-mastering-stage" aria-live="polite" data-testid="mastering-stage">{t[stage]}</p>
    <progress className="web-mastering-progress" aria-label={t.render}/>
    <div className="web-mastering-time"><span>{t.elapsed}</span><strong>{time(elapsed)}</strong></div>
    <p id="mastering-detail">{t.processingHint}</p>
  </dialog>;
}
function time(n:number){const s=Math.max(0,Math.floor(n));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;}
async function identity(raw:ArrayBuffer){if(!globalThis.crypto?.subtle)return '';try{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),v=>v.toString(16).padStart(2,'0')).join('');}catch{return '';}}
export default function App(){
  const [lang,setLang]=useState<Language>(()=>read<string>('lang','fr')==='en'?'en':'fr');const t=messages[lang];
  const [renderStage,setRenderStage]=useState<RenderStage>('stageEngine');const [renderStarted,setRenderStarted]=useState(0);const [renderDuration,setRenderDuration]=useState<number|null>(null);
  const [prefs,setPrefs]=useState(initialPrefs);const [busy,setBusy]=useState<Key|null>(null);const [error,setError]=useState<Key|null>(null);
  const [filename,setFilename]=useState('');const [fingerprint,setFingerprint]=useState('');const [original,setOriginal]=useState<AudioBuffer|null>(null);const [master,setMaster]=useState<AudioBuffer|null>(null);const [monitor,setMonitor]=useState<Monitor>('result');const [monitorAudio,setMonitorAudio]=useState<AudioBuffer|null>(null);
  const [metrics,setMetrics]=useState<Metrics|null>(null);const [recommended,setRecommended]=useState<{preset:string;antiFatigue:boolean}|null>(null);const [report,setReport]=useState<RenderReport|null>(null);const [diag,setDiag]=useState<Diagnostic|null>(null);const [mode,setMode]=useState<Mode>('');const [manual,setManual]=useState(false);const [changed,setChanged]=useState(false);const [depth,setDepth]=useState<16|24>(24);const [format,setFormat]=useState<'wav'|'flac'>('wav');
  const client=useMemo(()=>new EngineClient(),[]);const lock=useRef(false);const fileInput=useRef<HTMLInputElement>(null);
  const playback=useABAudioPlayer({originalBuffer:original,previewBuffer:monitor==='result'?master:monitorAudio});
  const waveform=useMemo(()=>buildWaveformRects(getCachedWaveformBins(playback.activeSource==='original'?original:monitor==='result'?master:monitorAudio,original)),[original,master,monitorAudio,monitor,playback.activeSource]);
  useEffect(()=>()=>client.dispose(),[client]);useEffect(()=>{document.documentElement.lang=lang;document.title=`PAXLAB Web 3.3 | ${t.edition}`;document.querySelector('meta[name="description"]')?.setAttribute('content',t.intro);write('lang',lang);},[lang,t]);useEffect(()=>write('prefs',prefs),[prefs]);
  const number=(v:number|string|undefined,d=2)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString(lang,{minimumFractionDigits:d,maximumFractionDigits:d}):'-';
  function clear(){setRenderDuration(null);playback.stop();client.dispose();setOriginal(null);setMaster(null);setMonitorAudio(null);setMonitor('result');setFilename('');setFingerprint('');setMetrics(null);setRecommended(null);setReport(null);setDiag(null);setMode('');setManual(false);setChanged(false);setError(null);if(fileInput.current)fileInput.current.value='';}
  async function load(file:File){if(lock.current)return;lock.current=true;clear();setBusy('load');try{if(file.size>200*1024*1024)throw new Error('size');const raw=await file.arrayBuffer();const hash=await identity(raw);const buffer=await decodeNative(raw);const pcm=interleave(buffer);const detect=detectorPcm(raw,file.name);const transfer=[pcm,...(detect?[detect]:[])];const response=await client.request('load',{pcm,detect,rate:buffer.sampleRate,channels:buffer.numberOfChannels},transfer);if(!response.metrics||!response.diagnostic)throw new Error('response');const d=response.diagnostic;const saved=hash?read<Mode>(`manual:${hash}`,''):'';setFilename(file.name);setFingerprint(hash);setOriginal(buffer);setMetrics(response.metrics);setRecommended(response.recommended??null);setDiag(d);setMode(saved==='v55'||saved==='v6'?saved:d.mode);setManual(saved==='v55'||saved==='v6');}catch{client.dispose();setError('loadError');}finally{setBusy(null);lock.current=false;}}
  function invalidate(){setRenderDuration(null);playback.stop();setMaster(null);setMonitorAudio(null);setMonitor('result');setReport(null);setChanged(true);setError(null);}
  function preference<K extends keyof Prefs>(k:K,v:Prefs[K]){setPrefs(p=>{const n={...p,[k]:v};if(k==='vocalPresence'&&v===true){n.antiFatigue=false;n.bassPunch=false;}if((k==='antiFatigue'||k==='bassPunch')&&v===true)n.vocalPresence=false;return n;});invalidate();}
  function selectMode(m:Mode){setMode(m);setManual(!!m);if(fingerprint)write(`manual:${fingerprint}`,m);invalidate();}
  function autoMode(){setMode(diag?.mode??'');setManual(false);if(fingerprint)write(`manual:${fingerprint}`,'');invalidate();}
  async function render(){
    if(lock.current||!original||!mode)return;
    lock.current=true;invalidate();const started=performance.now();setRenderStage('stageEngine');setRenderStarted(started);setBusy('render');
    try{
      const r=await client.request('render',{settings:{...prefs,mode}},[],setRenderStage);
      if(!r.pcm||!r.report)throw new Error('response');
      setRenderStage('stagePlayback');
      // Yield for a paint before copying the large interleaved buffer into Web Audio.
      await new Promise<void>(resolve=>setTimeout(resolve,0));
      setMaster(audioFromPcm(r.pcm,original.sampleRate,original.numberOfChannels));setReport(r.report);setChanged(false);setRenderDuration((performance.now()-started)/1000);
      if(typeof r.elapsedMs==='number')console.info(`PAXLAB DSP + transfer preparation: ${(r.elapsedMs/1000).toFixed(2)} s`);
    }catch{setError('renderError');}finally{setBusy(null);lock.current=false;}
  }
  async function chooseMonitor(m:Monitor){if(lock.current||!master||!original)return;lock.current=true;playback.stop();try{if(m!=='result'){setBusy('monitorBusy');const r=await client.request('monitor',{mode:m});if(!r.pcm)throw new Error('response');setMonitorAudio(audioFromPcm(r.pcm,original.sampleRate,original.numberOfChannels));}else setMonitorAudio(null);setMonitor(m);}catch{setError('monitorError');}finally{setBusy(null);lock.current=false;}}
  async function exportMaster(){if(lock.current||!master)return;lock.current=true;setBusy('exporting');setError(null);try{const blob=format==='wav'?encodeWavFromAudioBuffer(master,{bitDepth:depth}):await encodeFlacFromAudioBuffer(master,{bitDepth:depth});const header=new Uint8Array(await blob.slice(0,12).arrayBuffer());const tag=String.fromCharCode(...header.slice(0,4));if(blob.size<44||tag!==(format==='wav'?'RIFF':'fLaC'))throw new Error('format');const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=buildSafeAudioFilename(filename,`PAXLAB_${prefs.preset}`,format);a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}catch{setError('exportError');}finally{setBusy(null);lock.current=false;}}
  function playAction(action:()=>Promise<void>){void action().catch(()=>setError('playbackError'));}
  const opts=(keys:Key[])=>keys.map(k=><option key={k} value={k}>{t[k]}</option>);
  const checkbox=(k:'masterB'|'antiFatigue'|'vocalPresence'|'stereoSpace'|'bassPunch'|'spacePreserve',disabled=false)=><label className="check" key={k}><input type="checkbox" checked={prefs[k]} disabled={!!busy||disabled} onChange={e=>preference(k,e.target.checked)}/>{t[k]}</label>;
  const finishing=prefs.masterB||prefs.level!=='off';
  return <div className="web-shell">
    {busy==='render'&&<MasteringDialog t={t} stage={renderStage} started={renderStarted}/>}
    <header className="web-header"><div><p className="eyebrow">PAXLAB WEB 3.3</p><h1>{t.edition}</h1><p>{t.intro}</p></div><label>{t.language}<select value={lang} onChange={e=>setLang(e.target.value as Language)}><option value="fr">Français</option><option value="en">English</option></select></label></header>
    <div className="web-layout"><main>
    <section className="panel web-panel"><h2>{t.file}</h2><div className="web-drop" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0])void load(e.dataTransfer.files[0]);}}><input ref={fileInput} type="file" accept=".wav,.flac,.mp3,.aiff,.ogg,.m4a,audio/*" hidden onChange={e=>{if(e.target.files?.[0])void load(e.target.files[0]);}}/><button className="web-primary" disabled={!!busy} onClick={()=>fileInput.current?.click()}>{t.select}</button><span>{t.drop}</span></div><p className="web-file">{filename||t.noFile}</p>{original&&<div className="web-inline"><small>{time(original.duration)} · {original.sampleRate.toLocaleString(lang)} Hz · {original.numberOfChannels===2?t.stereo:t.mono}</small><button disabled={!!busy} onClick={clear}>{t.reset}</button></div>}<small>{t.compressed}</small></section>
    <section className="panel web-panel"><h2>{t.comparison}</h2><div className="web-inline"><button disabled={!original||!!busy} className={playback.activeSource==='original'?'selected':''} onClick={()=>playAction(()=>playback.switchSource('original'))}>{t.original}</button><button disabled={!master||!!busy} className={playback.activeSource==='preview'?'selected':''} onClick={()=>playAction(()=>playback.switchSource('preview'))}>{t[monitor]}</button><select aria-label={t.comparison} value={monitor} disabled={!master||!!busy} onChange={e=>void chooseMonitor(e.target.value as Monitor)}><option value="result">{t.result}</option><option value="difference">{t.difference}</option>{report?.hasRemoved&&<option value="removed">{t.removed}</option>}</select></div>
    <svg viewBox="0 0 860 110" className="web-wave" aria-hidden="true">{waveform.map((r,i)=><rect key={i} {...r} fill={playback.activeSource==='original'?'#8FB2DE':'#D9B36C'}/>)}{playback.duration>0&&<line x1={860*playback.currentTime/playback.duration} x2={860*playback.currentTime/playback.duration} y1="0" y2="110" stroke="#fff"/>}</svg>
    <input className="web-seek" type="range" aria-label={t.seek} min="0" max={playback.duration||1} step="0.01" value={Math.min(playback.currentTime,playback.duration||1)} disabled={!original||!!busy} onChange={e=>playback.seek(+e.target.value)}/><div className="web-inline"><button disabled={!original||!!busy} onClick={()=>playAction(playback.playPause)}>{playback.isPlaying?t.pause:t.play}</button><button disabled={!original||!!busy} onClick={playback.stop}>{t.stop}</button><span>{time(playback.currentTime)} / {time(playback.duration)}</span></div>{original&&<small>{t.livePeak}: {number(playback.meter.instantPeakDb,1)} dBFS · {t.liveLufs}: {number(playback.meter.shortTermLufsEstimate,1)} LUFS</small>}{monitor!=='result'&&<small>{monitor==='difference'?t.differenceNote:t.removedNote}</small>}</section>
    <section className="panel web-panel"><h2>{t.metrics}</h2><table><thead><tr><th>{t.metrics}</th><th>{t.original}</th><th>{t.result}</th></tr></thead><tbody>{([['lufs','estimatedLufs'],['peak','peakDb'],['range','loudnessRange'],['corr','stereoCorrelation']] as const).map(([label,key])=><tr key={key}><td>{t[label]}</td><td>{number(metrics?.[key])}</td><td>{number(report?.after[key])}</td></tr>)}{report&&<><tr><td>{t.truePeak}</td><td>-</td><td>{number(report.truePeak4x)}</td></tr><tr><td>{t.limiter}</td><td>-</td><td>{number(report.limiterReduction)}</td></tr></>}</tbody></table>{report&&<p>{report.riderApplied?`${t.riderApplied} · ${t.riderReduction}: ${number(report.riderReduction)}`:t.riderSkipped}</p>}</section>
    </main><aside>
    <section className="panel web-panel"><h2>{t.generation}</h2><p className={diag?.mode?'web-diagnostic':'web-warning'}>{diag? t[diag.mode==='v55'?'probable55':diag.mode==='v6'?'probable6':'unknown']:t.noFile}</p>{diag?.slope!=null&&<small>{t.slope}: {number(diag.slope)} dB · {t.excerpts}: {diag.supporting}/{diag.count}</small>}{diag&&!diag.count&&<small>{t.formatUnknown}</small>}<p className="web-warning">{t.warning}</p><div className="web-inline"><button disabled={!original||!!busy} className={mode==='v55'?'selected':''} onClick={()=>selectMode('v55')}>V5.5</button><button disabled={!original||!!busy} className={mode==='v6'?'selected':''} onClick={()=>selectMode('v6')}>V6</button><button disabled={!original||!!busy} onClick={autoMode}>{t.auto}</button></div><small>{mode?`${manual?t.manual:t.automatic}: ${mode==='v55'?'V5.5':'V6'}`:t.choose}</small></section>
    <section className="panel web-panel"><h2>{t.preset}</h2>{recommended&&<button disabled={!!busy} onClick={()=>{setPrefs(p=>({...p,preset:recommended.preset,antiFatigue:recommended.antiFatigue,vocalPresence:recommended.antiFatigue?false:p.vocalPresence}));invalidate();}}>{t.recommendation}: {t[recommended.preset as Key]}{recommended.antiFatigue?` + ${t.antiFatigue}`:""}</button>}<select aria-label={t.preset} value={prefs.preset} disabled={!!busy} onChange={e=>preference('preset',e.target.value)}>{opts(['safe','balanced','impact','youtube','smooth','open'])}</select>{checkbox('antiFatigue')}{checkbox('vocalPresence')}{checkbox('stereoSpace')}{checkbox('bassPunch')}{checkbox('spacePreserve',prefs.preset==='youtube')}</section>
    <section className="panel web-panel"><h2>{t.experiments}</h2>{checkbox('masterB')}<label>{t.level}<select value={prefs.level} disabled={!!busy} onChange={e=>preference('level',e.target.value)}>{opts(['off','doux','progressif'])}</select></label><label>{t.rider}<select value={finishing?'off':prefs.rider} disabled={!!busy||finishing} onChange={e=>preference('rider',e.target.value)}>{opts(['off','auto','forced'])}</select></label><label>{t.riderProfile}<select value={prefs.riderProfile} disabled={!!busy||finishing||prefs.rider==='off'} onChange={e=>preference('riderProfile',e.target.value)}>{opts(['conservateur','equilibre','correctif'])}</select></label><small>{t.bypass}</small></section>
    <section className="panel web-panel"><button className="web-primary" disabled={!original||!mode||!!busy} onClick={()=>void render()}>{t.generate}</button><p role="status">{busy?t[busy]:error?t[error]:master?t.rendered:original?(changed?t.changed:t.ready):t.noFile}</p>{master&&renderDuration!==null&&<small>{t.elapsed}: {time(renderDuration)} ({number(renderDuration,1)} s)</small>}{error&&<small role="alert" className="web-warning">{t[error]}</small>}</section>
    <section className="panel web-panel"><h2>{t.export}</h2><div className="web-inline"><select aria-label={t.export} value={format} disabled={!!busy} onChange={e=>setFormat(e.target.value as 'wav'|'flac')}><option value="wav">WAV</option><option value="flac">FLAC</option></select><select aria-label={t.depth} value={depth} disabled={!!busy} onChange={e=>setDepth(+e.target.value as 16|24)}><option value="16">16 bit</option><option value="24">24 bit</option></select></div><button disabled={!master||!!busy} onClick={()=>void exportMaster()}>{t.download}</button></section>
    </aside></div><footer><p>{t.privacy}</p><p>{t.release}</p></footer></div>;
}

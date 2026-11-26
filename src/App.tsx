import {useEffect,useMemo,useRef,useState} from 'react';
import {messages,type Language} from './i18n';
import {EngineClient,type Diagnostic,type Metrics,type RenderReport,type RenderStage} from './audio/wasmClient';
import {audioFromPcm,decodeNative,detectorPcm,interleave} from './audio/webPcm';
import {encodeWavFromAudioBuffer,buildSafeAudioFilename} from './audio/exportWav';
import {encodeFlacFromAudioBuffer} from './audio/exportFlac';
import {useABAudioPlayer} from './audio/useABAudioPlayer';
import {buildWaveformRects,getCachedWaveformBins} from './audio/waveformView';
import {monitorGains} from './audio/monitorGain';

type Key=keyof typeof messages.fr;
type Mode=''|'v55'|'v6';
type Monitor='result'|'removed';
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
  const [volume,setVolume]=useState(()=>{const v=read<number>('volume',100);return typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(100,v)):100;});
  const [equal,setEqual]=useState(()=>read<boolean>('equal',false)===true);
  const [monitorTransition,setMonitorTransition]=useState<{resume:boolean}|null>(null);
  const hasResidual=!!master&&report?.hasRemoved===true;
  const gains=useMemo(()=>monitorGains(volume,equal,metrics?.estimatedLufs,report?.after.estimatedLufs,monitor!=='result'),[volume,equal,metrics,report,monitor]);
  const playback=useABAudioPlayer({originalBuffer:original,previewBuffer:monitor==='result'?master:monitorAudio,monitorGainDbBySource:gains});
  useEffect(()=>write('volume',volume),[volume]);useEffect(()=>write('equal',equal),[equal]);
  // The hook commits the new preview buffer before switching source. Preserve
  // the timeline when changing from the master to a lazily computed residual.
  useEffect(()=>{
    if(!monitorTransition)return;
    const {resume}=monitorTransition;
    setMonitorTransition(null);
    void (async()=>{
      try{await playback.switchSource('preview');if(resume)await playback.playPause();}
      catch{setError('playbackError');}
      finally{setBusy(null);lock.current=false;}
    })();
  },[monitorTransition,playback.switchSource,playback.playPause]);
  const waveform=useMemo(()=>buildWaveformRects(getCachedWaveformBins(playback.activeSource==='original'?original:monitor==='result'?master:monitorAudio,original)),[original,master,monitorAudio,monitor,playback.activeSource]);
  useEffect(()=>()=>client.dispose(),[client]);useEffect(()=>{document.documentElement.lang=lang;document.title=`PAXLAB Web Studio 3.3 | ${t.edition}`;document.querySelector('meta[name="description"]')?.setAttribute('content',t.intro);write('lang',lang);},[lang,t]);useEffect(()=>write('prefs',prefs),[prefs]);
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
  async function chooseMonitor(m:Monitor){
    if(lock.current||playback.isSwitching||!master||!original||(m==='removed'&&!hasResidual))return;
    if(m===monitor){playAction(()=>playback.switchSource('preview'));return;}
    lock.current=true;const resume=playback.isPlaying;playback.pause();setBusy('monitorBusy');setError(null);
    try{
      if(m!=='result'){
        const r=await client.request('monitor',{mode:m});if(!r.pcm)throw new Error('response');
        setMonitorAudio(audioFromPcm(r.pcm,original.sampleRate,original.numberOfChannels));
      }else setMonitorAudio(null);
      setMonitor(m);setMonitorTransition({resume});
    }catch{setError('monitorError');setBusy(null);lock.current=false;}
  }
  async function exportMaster(){if(lock.current||!master)return;lock.current=true;setBusy('exporting');setError(null);try{const blob=format==='wav'?encodeWavFromAudioBuffer(master,{bitDepth:depth}):await encodeFlacFromAudioBuffer(master,{bitDepth:depth});const header=new Uint8Array(await blob.slice(0,12).arrayBuffer());const tag=String.fromCharCode(...header.slice(0,4));if(blob.size<44||tag!==(format==='wav'?'RIFF':'fLaC'))throw new Error('format');const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=buildSafeAudioFilename(filename,`PAXLAB_${prefs.preset}`,format);a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}catch{setError('exportError');}finally{setBusy(null);lock.current=false;}}
  function playAction(action:()=>Promise<void>){void action().catch(()=>setError('playbackError'));}
  const opts=(keys:Key[])=>keys.map(k=><option key={k} value={k}>{t[k]}</option>);
  const checkbox=(k:'masterB'|'antiFatigue'|'vocalPresence'|'stereoSpace'|'bassPunch'|'spacePreserve',disabled=false)=><label className="check" key={k}><input type="checkbox" checked={prefs[k]} disabled={!!busy||disabled} onChange={e=>preference(k,e.target.checked)}/>{t[k]}</label>;
  const toggle=(k:'antiFatigue'|'vocalPresence'|'stereoSpace'|'bassPunch')=><label className="studio-toggle" key={k}><span>{t[k]}</span><input type="checkbox" role="switch" checked={prefs[k]} disabled={!!busy} onChange={e=>preference(k,e.target.checked)}/></label>;
  const finishing=prefs.masterB||prefs.level!=='off';
  const selectedSource=playback.activeSource==='original'?'original':monitor==='result'?'result':'residue';
  const playbackDisabled=!!busy||playback.isSwitching;
  const sourceMetrics=playback.activeSource==='original'?metrics:monitor==='result'?report?.after:null;
  const delta=(before:number|string|undefined,after:number|string|undefined,unit:string,d=1)=>typeof before==='number'&&typeof after==='number'&&Number.isFinite(before)&&Number.isFinite(after)?`${after-before>0?'+':''}${number(after-before,d)}${unit?` ${unit}`:''}`:'-';
  const outputName=filename?buildSafeAudioFilename(filename,`PAXLAB_${prefs.preset}`,format):'-';
  const status=busy?t[busy]:error?t[error]:master?t.rendered:original?(changed?t.changed:t.ready):t.noFile;
  const metricCard=(label:string,value:string,detail:string)=><div className="studio-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
  const presetKeys=['safe','balanced','impact','youtube','smooth','open'] as const;
  const exportChoices=[['flac',24],['wav',24],['wav',16],['flac',16]] as const;
  return <div className="web-shell studio-shell">
    {busy==='render'&&<MasteringDialog t={t} stage={renderStage} started={renderStarted}/>}
    <header className="studio-header"><div className="studio-brand"><span className="studio-logo" aria-hidden="true">P</span><div><h1>PAXLAB Web Studio</h1><p>v3.3 RC2.1 <span className="studio-head-divider">|</span> {t.edition}</p></div></div><div className="studio-head-actions"><span className="studio-local"><span aria-hidden="true"/>{t.local}</span><label className="studio-lang"><span className="sr-only">{t.language}</span><select aria-label={t.language} value={lang} onChange={e=>setLang(e.target.value as Language)}><option value="fr">FR</option><option value="en">EN</option></select></label></div></header>
    <div className="studio-layout"><main className="studio-main">
      <section className="studio-panel studio-file" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(e.dataTransfer.files[0]&&!busy)void load(e.dataTransfer.files[0]);}}>
        <span className="studio-file-icon" aria-hidden="true">♪</span><div className="studio-file-copy"><h2>{filename||t.dropTitle}</h2><p>{original?`${time(original.duration)} · ${original.sampleRate.toLocaleString(lang)} Hz · ${original.numberOfChannels===2?t.stereo:t.mono}`:t.dropSubtitle}</p></div><input ref={fileInput} type="file" accept=".wav,.flac,.mp3,.aiff,.ogg,.m4a,audio/*" hidden onChange={e=>{if(e.target.files?.[0])void load(e.target.files[0]);}}/><button disabled={!!busy} onClick={()=>fileInput.current?.click()}>{t.browse}</button>{original&&<button className="studio-icon-btn" title={t.reset} aria-label={t.reset} disabled={!!busy} onClick={clear}>×</button>}
      </section>
      <section className="studio-panel studio-listening" aria-label={t.comparison}>
        <div className="studio-transport"><div className="studio-segment" role="group" aria-label={t.comparison}><button aria-pressed={selectedSource==='original'} disabled={!original||playbackDisabled} onClick={()=>playAction(()=>playback.switchSource('original'))}>{t.original}</button><button aria-pressed={selectedSource==='result'} disabled={!master||playbackDisabled} onClick={()=>void chooseMonitor('result')}>{t.result}</button><button aria-pressed={selectedSource==='residue'} disabled={!hasResidual||playbackDisabled} title={!hasResidual?t.noResidual:t.removedNote} onClick={()=>void chooseMonitor('removed')}>{t.residue}</button></div><label className="studio-equal" title={t.equalNote}><span>{t.equalVolume}</span><input type="checkbox" role="switch" checked={equal} disabled={!master||playbackDisabled||selectedSource==='residue'} onChange={e=>setEqual(e.target.checked)}/></label><div className="studio-play-buttons"><button className="studio-primary studio-icon-btn" disabled={!original||playbackDisabled} title={playback.isPlaying?t.pause:t.play} aria-label={playback.isPlaying?t.pause:t.play} onClick={()=>playAction(playback.playPause)}>{playback.isPlaying?'Ⅱ':'▶'}</button><button className="studio-icon-btn" disabled={!original||playbackDisabled} title={t.stop} aria-label={t.stop} onClick={playback.stop}>■</button></div></div>
        <div className="studio-volume-row"><label className="studio-volume"><span>{t.volume}</span><input type="range" min="0" max="100" value={volume} disabled={!!busy} onChange={e=>setVolume(+e.target.value)}/><output>{volume} %</output></label><div className="studio-track-status"><small>{selectedSource==='residue'?t.removedNote:original?t[selectedSource]:t.noFile}</small><span className="studio-chip" role="status">{status}</span></div></div>
        <div className="studio-wave" onClick={e=>{if(!original||playbackDisabled)return;const rect=e.currentTarget.getBoundingClientRect();playback.seek(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*playback.duration);}}><svg viewBox="0 0 860 110" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="860" y1="55" y2="55" stroke="currentColor" opacity=".15"/>{waveform.map((r,i)=><rect key={i} {...r} fill={selectedSource==='residue'?'#9DAAC0':'#D9B36C'}/>)}{playback.duration>0&&<line x1={860*playback.currentTime/playback.duration} x2={860*playback.currentTime/playback.duration} y1="0" y2="110" stroke="#fff" vectorEffect="non-scaling-stroke"/>}</svg></div>
        <div className="studio-timeline"><span>{time(playback.currentTime)}</span><input type="range" aria-label={t.seek} min="0" max={playback.duration||1} step="0.01" value={Math.min(playback.currentTime,playback.duration||1)} disabled={!original||playbackDisabled} onChange={e=>playback.seek(+e.target.value)}/><span>{time(playback.duration)}</span></div>
        <section className="studio-experiments" aria-label={t.processing}>
          <h2 className="studio-kicker">{t.processing}</h2>
          <div className="studio-experiment-grid">
            <div className="studio-processing-block"><h3>{t.experiments}</h3>
              <label className="check studio-finishing"><input type="checkbox" checked={prefs.masterB} disabled={!!busy} onChange={e=>preference('masterB',e.target.checked)} aria-label={t.masterB}/><span><strong>{t.finishingShort}</strong><small>{t.finishingDesc}</small></span></label>
              <label className="studio-level"><span>{t.level}</span><select aria-label={t.level} value={prefs.level} disabled={!!busy} onChange={e=>preference('level',e.target.value)}>{opts(['off','doux','progressif'])}</select></label>
            </div>
            <div className="studio-processing-block studio-rider" data-bypassed={finishing}><h3>{t.riderShort}</h3>
              <label><span>{t.riderMode}</span><select aria-label={t.rider} value={finishing?'off':prefs.rider} disabled={!!busy||finishing} onChange={e=>preference('rider',e.target.value)}>{opts(['off','auto','forced'])}</select></label>
              <label><span>{t.riderProfile}</span><select value={prefs.riderProfile} disabled={!!busy||finishing||prefs.rider==='off'} onChange={e=>preference('riderProfile',e.target.value)}>{opts(['conservateur','equilibre','correctif'])}</select></label>
              <small className="studio-rider-note">{finishing?t.bypass:t.riderDesc}</small>
            </div>
            <div className="studio-processing-block"><h3>{t.extraOptions}</h3><div className="studio-toggle-list">{toggle('antiFatigue')}{toggle('vocalPresence')}{toggle('stereoSpace')}{toggle('bassPunch')}</div></div>
          </div>
        </section>
        <div className="studio-metrics studio-metrics-three">{metricCard(t.livePeak,playback.isPlaying?`${number(playback.meter.instantPeakDb,1)} dBFS`:'-',t.monitorOnly)}{metricCard(t.liveLufs,playback.isPlaying?`${number(playback.meter.shortTermLufsEstimate,1)} LUFS`:'-',t.monitorOnly)}{metricCard(t.headroom,typeof sourceMetrics?.peakDb==='number'&&Number.isFinite(sourceMetrics.peakDb)?`${number(-sourceMetrics.peakDb,1)} dB`:'-',t.sampleHeadroom)}</div>
      </section>
      <section className="studio-panel studio-changes"><div className="studio-section-head"><div><span className="studio-kicker">{t.whatChanged}</span><h2>{t.quickReview}</h2></div><span className="studio-chip">{t.estimated}</span></div><div className="studio-metrics studio-metrics-five">{metricCard(t.perceived,delta(metrics?.estimatedLufs,report?.after.estimatedLufs,'LU'),t.lufs)}{metricCard(t.peak,delta(metrics?.peakDb,report?.after.peakDb,'dB'),t.beforeAfter)}{metricCard(t.range,delta(metrics?.loudnessRange,report?.after.loudnessRange,'LU'),t.beforeAfter)}{metricCard(t.corr,delta(metrics?.stereoCorrelation,report?.after.stereoCorrelation,'',3),t.beforeAfter)}{metricCard(t.truePeak,report?`${number(report.truePeak4x,1)} dBTP`:'-',t.finalSafety)}</div></section>
      <details className="studio-panel studio-details"><summary><span><span className="studio-kicker">{t.technical}</span><strong>{t.beforeAfter}</strong></span><span aria-hidden="true" className="studio-chevron">⌄</span></summary><table><thead><tr><th>{t.metrics}</th><th>{t.original}</th><th>{t.result}</th></tr></thead><tbody>{([['lufs','estimatedLufs'],['peak','peakDb'],['range','loudnessRange'],['corr','stereoCorrelation']] as const).map(([label,key])=><tr key={key}><td>{t[label]}</td><td>{number(metrics?.[key])}</td><td>{number(report?.after[key])}</td></tr>)}{report&&<><tr><td>{t.truePeak}</td><td>-</td><td>{number(report.truePeak4x)}</td></tr><tr><td>{t.limiter}</td><td>-</td><td>{number(report.limiterReduction)}</td></tr></>}</tbody></table>{report&&<p>{report.riderApplied?`${t.riderApplied} · ${t.riderReduction}: ${number(report.riderReduction)}`:t.riderSkipped}</p>}<small>{t.compressed}</small></details>
    </main><aside className="studio-side">
      <section className="studio-panel studio-render"><div className="studio-render-title"><span className="studio-kicker">{t.renderPanel}</span><h2>{t.chooseRender}</h2></div><h3>{t.generation}</h3><div className="studio-choice-grid studio-generation" role="group" aria-label={t.generation}><button aria-label="V5.5" aria-pressed={mode==='v55'} disabled={!original||!!busy} onClick={()=>selectMode('v55')}><strong>V5.5</strong><small>{t.legacy}</small></button><button aria-label="V6" aria-pressed={mode==='v6'} disabled={!original||!!busy} onClick={()=>selectMode('v6')}><strong>V6</strong><small>{t.restoration}</small></button></div>
        <div className="studio-advice"><div className="studio-advice-head"><strong>{diag?t[diag.mode==='v55'?'probable55':diag.mode==='v6'?'probable6':'unknown']:t.detectWaiting}</strong>{original&&<button className="studio-auto" disabled={!!busy} onClick={autoMode}>{t.auto}</button>}</div><small>{mode?`${manual?t.manual:t.automatic}: ${mode==='v55'?'V5.5':'V6'}`:t.choose}</small><details className="studio-detect-details"><summary>{t.detectInfo}</summary>{diag?.slope!=null&&<small>{t.slope}: {number(diag.slope)} dB · {t.excerpts}: {diag.supporting}/{diag.count}</small>}{diag&&!diag.count&&<small>{t.formatUnknown}</small>}<small>{t.warning}</small></details></div>
        <div className="studio-advice"><strong>{t.advice}</strong>{recommended?<button className="studio-recommendation" disabled={!!busy} onClick={()=>{setPrefs(p=>({...p,preset:recommended.preset,antiFatigue:recommended.antiFatigue,vocalPresence:recommended.antiFatigue?false:p.vocalPresence}));invalidate();}}>{t.recommendation}: {t[recommended.preset as Key]}{recommended.antiFatigue?` + ${t.antiFatigue}`:''}</button>:<small>{t.adviceWaiting}</small>}</div>
        <div className="studio-choice-grid" role="group" aria-label={t.preset}>{presetKeys.slice(0,4).map(k=><button key={k} aria-pressed={prefs.preset===k} disabled={!!busy} onClick={()=>preference('preset',k)}><strong>{t[k]}</strong><small>{t[`${k}Desc` as Key]}</small></button>)}</div>
        <details className="studio-advanced"><summary>{t.advanced}{(prefs.preset==='smooth'||prefs.preset==='open')?` · ${t[prefs.preset]}`:''}<span aria-hidden="true">⌄</span></summary><div className="studio-choice-grid" role="group" aria-label={t.otherPresets}>{presetKeys.slice(4).map(k=><button key={k} aria-pressed={prefs.preset===k} disabled={!!busy} onClick={()=>preference('preset',k)}>{t[k]}</button>)}</div>{checkbox('spacePreserve',prefs.preset==='youtube')}</details>
        <button className="studio-primary studio-generate" disabled={!original||!mode||!!busy} onClick={()=>void render()}>{t.generate}</button>{master&&renderDuration!==null&&<small>{t.elapsed}: {time(renderDuration)} ({number(renderDuration,1)} s)</small>}{error&&<p role="alert" className="studio-error">{t[error]}</p>}
      </section>
      <section className="studio-panel studio-export"><div className="studio-section-head"><h2 className="studio-kicker">{t.export}</h2><span className="studio-chip">{master?t.rendered:t.waiting}</span></div><h3>{t.outputFormat}</h3><div className="studio-choice-grid" role="group" aria-label={t.outputFormat}>{exportChoices.map(([f,d])=><button key={`${f}${d}`} aria-pressed={format===f&&depth===d} disabled={!!busy} onClick={()=>{setFormat(f);setDepth(d);}}><strong>{f.toUpperCase()} {d} bit</strong></button>)}</div><label className="studio-output-name"><span>{t.outputName}</span><output>{outputName}</output></label><button className="studio-download" disabled={!master||!!busy} onClick={()=>void exportMaster()}>{t.download}</button></section>
    </aside></div><footer className="studio-footer"><span>{t.intro}</span><span>{t.privacy}</span><span>{t.release}</span></footer></div>;
}

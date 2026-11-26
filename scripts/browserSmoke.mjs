import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'inherit'});
let browser;
try{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:4173/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  page.setDefaultTimeout(180000);page.on('pageerror',e=>console.error(e));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  // Observe the actual worker messages independently from the React UI.
  await page.addInitScript(()=>{
    window.paxlabStages=[];window.paxlabHasRemoved=null;
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker {
      constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data?.progress)window.paxlabStages.push(e.data.progress);if(e.data?.report)window.paxlabHasRemoved=e.data.report.hasRemoved;});}
    };
  });
  await page.goto('http://127.0.0.1:4173/');
  await page.getByLabel('Langue').selectOption('en');await page.getByLabel('Language').waitFor();assert.equal(await page.getByLabel('Language').inputValue(),'en');
  await page.reload();await page.getByLabel('Language').waitFor();assert.equal(await page.getByLabel('Language').inputValue(),'en');
  const rate=48000,seconds=8,n=rate*seconds*2*2,buf=Buffer.alloc(44+n);
  buf.write('RIFF');buf.writeUInt32LE(36+n,4);buf.write('WAVE',8);buf.write('fmt ',12);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);buf.writeUInt16LE(2,22);buf.writeUInt32LE(rate,24);buf.writeUInt32LE(rate*4,28);buf.writeUInt16LE(4,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(n,40);
  for(let i=0;i<rate*seconds;i++){let t=i/rate,amp=t<4?.12:.30;buf.writeInt16LE(Math.round(32767*amp*(Math.sin(2*Math.PI*997*t)+.2*Math.sin(2*Math.PI*13000*t))),44+i*4);buf.writeInt16LE(Math.round(32767*amp*(Math.sin(2*Math.PI*997*t+.1)+.2*Math.sin(2*Math.PI*15000*t))),46+i*4);}
  // Exercise Detect() too: the short render fixture bypasses the detector.
  const silent=Buffer.alloc(44+rate*20*4);buf.copy(silent,0,0,44);
  silent.writeUInt32LE(silent.length-8,4);silent.writeUInt32LE(silent.length-44,40);
  await page.locator('input[type=file]').setInputFiles({name:'detector.wav',mimeType:'audio/wav',buffer:silent});
  await page.getByRole('status').filter({hasText:'Analysis complete'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Generate master',exact:true}).isDisabled(),true);
  await page.locator('input[type=file]').setInputFiles({name:'smoke.wav',mimeType:'audio/wav',buffer:buf});
  await page.getByRole('status').filter({hasText:'Analysis complete'}).waitFor();
  async function checkCompactLayout(){
    for(const viewport of [{width:1920,height:940},{width:1600,height:900}]){
      await page.setViewportSize(viewport);
      const layout=await page.evaluate(()=>({height:document.documentElement.scrollHeight,width:document.documentElement.scrollWidth,exportBottom:document.querySelector('.studio-download').getBoundingClientRect().bottom,waveHeight:document.querySelector('.studio-wave').getBoundingClientRect().height}));
      assert.ok(layout.height<=viewport.height+1 && layout.width<=viewport.width+1,`Unexpected desktop scrolling: ${JSON.stringify(layout)}`);
      assert.ok(layout.exportBottom<=viewport.height+1,'Export button outside viewport');
      assert.ok(layout.waveHeight>=100 && layout.waveHeight<=110,'Waveform height outside compact range');
    }
  }
  await checkCompactLayout();
  const render=page.getByRole('button',{name:'Generate master',exact:true});assert.equal(await render.isDisabled(),true);
  await page.getByRole('button',{name:'V5.5',exact:true}).click();
  async function renderAndCheck(expected){
    await page.evaluate(()=>{window.paxlabStages=[];});
    const started=Date.now();await render.click();
    const modal=page.getByRole('dialog',{name:'Mastering in progress…'});
    await modal.waitFor({state:'visible'});
    assert.equal(await modal.getByRole('progressbar').count(),1);
    await page.getByRole('status').filter({hasText:'Master ready'}).waitFor();
    await modal.waitFor({state:'hidden'});
    const stages=await page.evaluate(()=>window.paxlabStages);
    for(const stage of expected)assert.ok(stages.includes(stage),`Missing actual worker progress: ${stage}`);
    console.log(`Browser render: ${(Date.now()-started)/1000}s, stages: ${stages.join(', ')}`);
  }
  await renderAndCheck(['stagePlan','stageAnalysis','stageSpectrum','stageDynamics','stageNormalize','stageSafety','stageFinalMetrics','stageTransfer']);
  // Studio workspace: one waveform, accessible A/B/residual controls and monitoring-only gain.
  assert.equal(await page.locator('.studio-wave svg').count(),1);
  const original=page.getByRole('button',{name:'Original',exact:true});
  const master=page.getByRole('button',{name:'Master',exact:true});
  const residual=page.getByRole('button',{name:'Residual',exact:true});
  const seek=page.getByRole('slider',{name:'Playback position'});
  await seek.fill('2');
  await master.click();await master.and(page.locator('[aria-pressed=true]')).waitFor();
  assert.ok(Math.abs(Number(await seek.inputValue())-2)<0.05);
  await page.getByRole('switch',{name:'Equal loudness'}).check();
  await page.getByRole('slider',{name:'Listening volume'}).fill('37');
  assert.equal(await residual.isDisabled(),true,'V5.5 must not expose overall difference as residual');
  assert.equal(await page.evaluate(()=>window.paxlabHasRemoved),false);
  await original.click();await original.and(page.locator('[aria-pressed=true]')).waitFor();
  await master.click();await master.and(page.locator('[aria-pressed=true]')).waitFor();
  assert.ok(Math.abs(Number(await seek.inputValue())-2)<0.05);
  await checkCompactLayout();
  for(const viewport of [{width:390,height:844},{width:320,height:640}]){
    await page.setViewportSize(viewport);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile horizontal overflow');
  }
  await page.setViewportSize({width:1600,height:900});
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export',exact:true}).click()]);assert.ok(download.suggestedFilename().endsWith('.wav'));
  const rider=page.locator('.studio-rider select').first();
  assert.equal(await rider.isDisabled(),false);
  const riderBefore=await rider.inputValue();
  await page.getByLabel('Section leveling').selectOption('doux');
  assert.equal(await rider.isDisabled(),true);assert.equal(await rider.inputValue(),'off');
  await page.getByLabel('Section leveling').selectOption('off');
  assert.equal(await rider.isDisabled(),false);assert.equal(await rider.inputValue(),riderBefore);
  await page.getByLabel('Section leveling').selectOption('doux');await renderAndCheck(['stageFinishing','stageTransfer']);assert.equal(await residual.isDisabled(),true);
  await page.getByRole('button',{name:'V6',exact:true}).click();await page.getByLabel('Section leveling').selectOption('progressif');await page.getByLabel('Finishing B - tonal correction and micro-leveling').check();await renderAndCheck(['stageV6Diagnostic','stageV6Analysis','stageV6Guard','stageFinishing','stageTransfer']);
  const hasRemoved=await page.evaluate(()=>window.paxlabHasRemoved);
  assert.equal(typeof hasRemoved,'boolean');
  assert.equal(await residual.isDisabled(),!hasRemoved,'Residual availability must follow engine report');
  if(hasRemoved){await seek.fill('2');await residual.click();await residual.and(page.locator('[aria-pressed=true]')).waitFor();assert.ok(Math.abs(Number(await seek.inputValue())-2)<0.05);}
  await page.getByLabel('Language').selectOption('fr');await page.getByRole('status').filter({hasText:'Rendu prêt'}).waitFor();
  await checkCompactLayout();
  await page.locator('input[type=file]').setInputFiles({name:'new.wav',mimeType:'audio/wav',buffer:buf});
  await page.getByRole('status').filter({hasText:'Analyse terminée'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Résidu',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'Original',exact:true}).getAttribute('aria-pressed'),'true');
  console.log('Browser smoke: language persistence, detector JSON, mandatory manual choice, V5.5, R1, V6 + R2 + B, WAV export passed.');
}finally{await browser?.close();server.kill();}

let api;
let activeId = null;
// Called synchronously by the C# engine, including while Render is busy.
globalThis.paxlabProgress = stage => {
  if (activeId !== null) self.postMessage({id: activeId, progress: stage});
};
async function engine() {
  if (!api) {
    const { dotnet } = await import('./engine/_framework/dotnet.js');
    const runtime = await dotnet.withDiagnosticTracing(false).create();
    api = (await runtime.getAssemblyExports(runtime.getConfig().mainAssemblyName)).Program;
  }
  return api;
}
self.onmessage = async ({data}) => {
  const {id, op} = data;
  if (activeId !== null) { self.postMessage({id, error:true}); return; }
  activeId = id;
  const started = performance.now();
  try {
    if (op === 'render') globalThis.paxlabProgress('stageEngine');
    const e = await engine();
    if (op === 'load') {
      const {metrics,recommended} = JSON.parse(e.Load(new Uint8Array(data.pcm), data.rate, data.channels));
      const diagnostic = data.detect ? JSON.parse(e.Detect(new Uint8Array(data.detect))) : {mode:'',slope:null,supporting:0,count:0};
      self.postMessage({id, metrics, diagnostic, recommended});
    } else if (op === 'render' || op === 'monitor') {
      const bytes = op === 'render' ? e.Render(JSON.stringify(data.settings)) : e.Monitor(data.mode);
      // byte[] is marshalled to a fresh Uint8Array. Transfer directly when it
      // owns its entire buffer; otherwise copy just the relevant view.
      const pcm = bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer : bytes.slice().buffer;
      self.postMessage({id, pcm, report: op === 'render' ? JSON.parse(e.Report()) : null, elapsedMs: performance.now()-started}, [pcm]);
    } else throw new Error('Invalid operation');
  } catch (error) { console.error(error); self.postMessage({id, error:true}); }
  finally { activeId = null; }
};

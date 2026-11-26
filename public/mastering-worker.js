let api;
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
  try {
    const e = await engine();
    if (op === 'load') {
      const {metrics,recommended} = JSON.parse(e.Load(new Uint8Array(data.pcm), data.rate, data.channels));
      const diagnostic = data.detect ? JSON.parse(e.Detect(new Uint8Array(data.detect))) : {mode:'',slope:null,supporting:0,count:0};
      self.postMessage({id, metrics, diagnostic, recommended});
    } else if (op === 'render' || op === 'monitor') {
      const bytes = op === 'render' ? e.Render(JSON.stringify(data.settings)) : e.Monitor(data.mode);
      const pcm = bytes.slice().buffer;
      self.postMessage({id, pcm, report: op === 'render' ? JSON.parse(e.Report()) : null}, [pcm]);
    } else throw new Error('Invalid operation');
  } catch (error) { console.error(error); self.postMessage({id, error:true}); }
};

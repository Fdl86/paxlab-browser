export interface Metrics { estimatedLufs: number | string; peakDb: number | string; loudnessRange: number | string; stereoCorrelation: number | string; rmsDb: number | string; }
export interface Diagnostic { mode: '' | 'v55' | 'v6'; slope: number | null; supporting: number; count: number; }
export interface RenderReport { before: Metrics; after: Metrics; riderApplied: boolean; riderReduction: number; riderBypassed: boolean; hasRemoved: boolean; limiterReduction: number; truePeak4x: number | string; }
export interface Reply { recommended?: {preset:string; antiFatigue:boolean}; metrics?: Metrics; diagnostic?: Diagnostic; pcm?: ArrayBuffer; report?: RenderReport; error?: boolean; id:number; }
export class EngineClient {
  private worker: Worker | null = null;
  private id=0;
  private pending = new Map<number,{resolve:(r:Reply)=>void; reject:(e:Error)=>void}>();
  private getWorker() {
    if(!this.worker){
      const worker=new Worker(`${import.meta.env.BASE_URL}mastering-worker.js`,{type:'module'});
      worker.onmessage=({data}:MessageEvent<Reply>)=>{const p=this.pending.get(data.id); if(!p)return; this.pending.delete(data.id); if(data.error)p.reject(new Error('Engine'));else p.resolve(data);};
      worker.onerror=()=>this.dispose();
      this.worker=worker;
    }
    return this.worker;
  }
  request(op:string,data:Record<string,unknown>,transfer:Transferable[]=[]):Promise<Reply>{
    const id=++this.id; const worker=this.getWorker();
    return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});try{worker.postMessage({id,op,...data},transfer);}catch(e){this.pending.delete(id);reject(e);}});
  }
  dispose(){this.worker?.terminate();this.worker=null;for(const p of this.pending.values())p.reject(new Error('Worker stopped'));this.pending.clear();}
}

export interface Metrics { estimatedLufs: number | string; peakDb: number | string; loudnessRange: number | string; stereoCorrelation: number | string; rmsDb: number | string; }
export interface Diagnostic { mode: '' | 'v55' | 'v6'; slope: number | null; supporting: number; count: number; }
export interface RenderReport { before: Metrics; after: Metrics; riderApplied: boolean; riderReduction: number; riderBypassed: boolean; hasRemoved: boolean; limiterReduction: number; truePeak4x: number | string; }
export const renderStages = ['stageEngine','stagePlan','stageRider','stageRiderApply','stageV6Diagnostic','stageV6Space','stageV6Presence','stageV6Boxiness','stageV6Sibilance','stageV6HF','stageV6Analysis','stageAnalysis','stageCleanup','stageSpectrum','stageDynamics','stageNormalize','stageSafety','stageV6Guard','stageFinishing','stageFinalMetrics','stageTransfer','stagePlayback','stageProcessing'] as const;
export type RenderStage = typeof renderStages[number];
export interface Reply { recommended?: {preset:string; antiFatigue:boolean}; metrics?: Metrics; diagnostic?: Diagnostic; pcm?: ArrayBuffer; report?: RenderReport; error?: boolean; progress?: RenderStage; elapsedMs?: number; id:number; }
interface Pending {resolve:(r:Reply)=>void; reject:(e:Error)=>void; onProgress?:(stage:RenderStage)=>void;}
export class EngineClient {
  private worker: Worker | null = null;
  private id=0;
  private pending = new Map<number,Pending>();
  private getWorker() {
    if(!this.worker){
      const worker=new Worker(`${import.meta.env.BASE_URL}mastering-worker.js?v=rc1-perf1`,{type:'module'});
      worker.onmessage=({data}:MessageEvent<Reply>)=>{
        const p=this.pending.get(data.id); if(!p)return;
        if(data.progress){if(renderStages.includes(data.progress))p.onProgress?.(data.progress);return;}
        this.pending.delete(data.id); if(data.error)p.reject(new Error('Engine'));else p.resolve(data);
      };
      worker.onerror=()=>this.dispose();
      worker.onmessageerror=()=>this.dispose();
      this.worker=worker;
    }
    return this.worker;
  }
  request(op:string,data:Record<string,unknown>,transfer:Transferable[]=[],onProgress?:(stage:RenderStage)=>void):Promise<Reply>{
    const id=++this.id; const worker=this.getWorker();
    return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject,onProgress});try{worker.postMessage({id,op,...data},transfer);}catch(e){this.pending.delete(id);reject(e);}});
  }
  dispose(){this.worker?.terminate();this.worker=null;for(const p of this.pending.values())p.reject(new Error('Worker stopped'));this.pending.clear();}
}

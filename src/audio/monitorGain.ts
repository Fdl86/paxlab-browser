// Monitoring only: never changes PCM, rendering or exports. Equal loudness only
// attenuates the louder of the original and the master (estimated integrated LUFS).
export function monitorGains(volume:number,equal:boolean,original:unknown,master:unknown,nativeResidual:boolean){
  const linear=Math.max(0,Math.min(1,Number.isFinite(volume)?volume/100:1));
  const volumeDb=linear===0?-Infinity:20*Math.log10(linear);
  let originalDb=0,previewDb=0;
  if(equal&&typeof original==='number'&&Number.isFinite(original)&&typeof master==='number'&&Number.isFinite(master)&&original>-80&&master>-80){
    const target=Math.min(original,master);
    originalDb=target-original;previewDb=target-master;
  }
  return {original:volumeDb+originalDb,preview:volumeDb+(nativeResidual?0:previewDb)};
}

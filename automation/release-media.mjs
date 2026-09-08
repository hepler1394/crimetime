import { readFile,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReleaseStore, validName } from './studio/release-store.mjs';
import { renderTrailer } from './studio/trailer-engine.mjs';
import { mixAudio,processMedia,measureAudio } from './studio/media-engine.mjs';
const [kind,id,snapshot]=process.argv.slice(2),store=new ReleaseStore();
async function main(){
try{
 if(!validName(snapshot))throw new Error('Invalid media snapshot.');
 const r=await store.get(id),spec=JSON.parse(await readFile(join(store.folder(id),snapshot),'utf8')),stamp=Date.now(),name=`mix-${spec.bypass?'original':spec.preview?'preview':'master'}-${stamp}.wav`,dir=join(store.root,'projects',r.researchId),output=join(dir,name);
 if(kind==='trailer'){const trailerName='trailer-'+(spec.preview?'preview':'full')+'-'+stamp+'.mp4';const result=await renderTrailer(store,r,spec.storyboard,join(dir,trailerName),{preview:spec.preview});await writeFile(join(dir,trailerName+'.json'),JSON.stringify({storyboard:spec.storyboard,preview:spec.preview,result}));console.log(JSON.stringify({ok:true,name:trailerName,...result}));return;}
 if(kind!=='mix')throw new Error('Unsupported media operation.');
 console.log('Rendering the saved timeline. Original media is preserved.');let measured=await mixAudio(store,r,spec.timeline,output,{bypass:spec.bypass,seconds:spec.preview?15:null});
 if(spec.timeline.cleanup?.master&&!spec.bypass){const master=join(dir,'master-'+name);await processMedia('ffmpeg',['-hide_banner','-y','-i',output,'-af','loudnorm=I=-16:TP=-1.5:LRA=11','-ar','48000','-c:a','pcm_s16le',master]);measured=await measureAudio(master);await writeFile(join(dir,'master-'+name+'.json'),JSON.stringify({measured,timeline:spec.timeline}));console.log(JSON.stringify({ok:true,name:'master-'+name,measured}));}
 else{await writeFile(join(dir,name+'.json'),JSON.stringify({measured,timeline:spec.timeline}));console.log(JSON.stringify({ok:true,name,measured}));}
}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}

}
await main();

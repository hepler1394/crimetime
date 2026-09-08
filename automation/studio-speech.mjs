import { readFile,writeFile,mkdir,copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { loadEnv } from './community/env.mjs';
import { providerConfig } from './studio/provider-settings.mjs';
import { renderVoiceChapter } from './studio/voice-cache.mjs';
import { speechChunks,elevenSpeech,deepgramTranscript } from './studio/speech-providers.mjs';
const root=fileURLToPath(new URL('./',import.meta.url));
const [kind,id]=process.argv.slice(2);
const run=(exe,args)=>new Promise((resolve,reject)=>{const p=spawn(exe,args,{windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`Audio processing exited with code ${code}`)));});
try{
 await loadEnv();if(!['elevenlabs','deepgram'].includes(kind)||! /^[a-z0-9][a-z0-9-]{0,120}$/.test(id||''))throw new Error('Invalid speech job.');
 const dir=join(root,'studio','drafts',id), ep=JSON.parse(await readFile(join(dir,'episode.json'),'utf8'));
 if(ep.status==='published')throw new Error('Published episode media is locked.');
 const cfg=await providerConfig(kind), stamp=Date.now(), archive=join(dir,'revisions');await mkdir(archive,{recursive:true});
 if(kind==='elevenlabs'){
   const chunks=(ep.script||[]).filter(s=>s.trim());if(!chunks.length)throw new Error('Save a script before making voice.');
   const files=[];
   for(let i=0;i<chunks.length;i++){console.log(`ElevenLabs: chapter ${i+1} of ${chunks.length}`);const result=await renderVoiceChapter(dir,chunks[i],cfg,{cacheDir:join(root,'studio','voice','.eleven-cache')});files.push(result.name);}
   const list=join(dir,`eleven-${stamp}.txt`);await writeFile(list,files.map(f=>`file '${f}'`).join('\n'));
   const combined=join(dir,`eleven-${stamp}-voice.mp3`);
   await run('ffmpeg',['-hide_banner','-loglevel','error','-f','concat','-safe','1','-i',list,'-c','copy',combined]);
   for(const name of ['episode.json','episode.mp3','voice.wav','transcript.json'])await copyFile(join(dir,name),join(archive,`${stamp}-${name}`)).catch(e=>{if(e.code!=='ENOENT')throw e;});
   await run(process.execPath,[join(root,'episode-voice.mjs'),id,'--from',combined,'--no-trim','--json']);
   console.log(JSON.stringify({ok:true,message:'ElevenLabs narration mastered into the episode. Previous media retained in revisions.'}));
 }else{
   const transcript=await deepgramTranscript(await readFile(join(dir,'episode.mp3')),cfg);
   await copyFile(join(dir,'transcript.json'),join(archive,`${stamp}-transcript.json`)).catch(e=>{if(e.code!=='ENOENT')throw e;});
   await writeFile(join(dir,'transcript.json'),JSON.stringify({...transcript,title:ep.title,slug:ep.slug},null,2));
   ep.files={...ep.files,transcript:'transcript.json'};await writeFile(join(dir,'episode.json'),JSON.stringify(ep,null,2)+'\n');
   await writeFile(join(dir,`deepgram-${stamp}.txt`),transcript.text);
   console.log(JSON.stringify({ok:true,message:'Deepgram transcript saved.',segments:transcript.segments.length}));
 }
}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}

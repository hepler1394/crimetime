import { mkdir,readFile,writeFile,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { atomicJson,jsonFile } from './release-store.mjs';
import { speechChunks,elevenSpeech } from './speech-providers.mjs';
import { processMedia } from './media-engine.mjs';
export async function renderVoiceChapter(dir,text,config,{audition=false,allowUncertain=false,fetcher=fetch,cacheDir}={}){
 const cache=cacheDir||join(dir,'.voice-cache');await mkdir(cache,{recursive:true});const files=[];
 const signature=JSON.stringify({text,voiceId:config.voiceId,model:config.model,controls:config.voiceSettings});const digest=createHash('sha256').update(signature).digest('hex').slice(0,24),name=`${audition?'voice-audition':'voice-chapter'}-${digest}.mp3`;
 if((await stat(join(dir,name)).catch(()=>null))?.size>0)return{name,cached:true};
 for(const [i,chunk] of speechChunks(text).entries()){
  const hash=createHash('sha256').update(JSON.stringify({chunk,voiceId:config.voiceId,model:config.model,controls:config.voiceSettings})).digest('hex'),file=join(cache,hash+'.mp3'),journal=join(cache,hash+'.json'),old=await jsonFile(journal);
  if((await stat(file).catch(()=>null))?.size>0){files.push(hash+'.mp3');continue;}
  if(['requesting','uncertain'].includes(old?.state)&&!allowUncertain)throw new Error('A previous voice request has an uncertain result. Review credits and explicitly allow retry in the voice booth. Completed sections are cached.');
  await atomicJson(journal,{state:'requesting',at:new Date().toISOString(),characters:chunk.length});
  try{const bytes=await elevenSpeech(chunk,config,fetcher);await writeFile(file,bytes);await atomicJson(journal,{state:'complete',bytes:bytes.length});}catch(e){await atomicJson(journal,{state:/HTTP (400|401|402|403|404|422|429)/.test(e.message)?'failed':'uncertain'});throw e;}
  files.push(hash+'.mp3');console.log(`Voice section ${i+1} of ${speechChunks(text).length} saved.`);
 }
 const list=join(cache,digest+'.txt');await writeFile(list,files.map(f=>`file '${f}'`).join('\n'));
 await processMedia('ffmpeg',['-hide_banner','-y','-loglevel','error','-f','concat','-safe','1','-i',list,'-c','copy',join(dir,name)]);return{name,cached:false};
}

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReleaseStore,validName } from './studio/release-store.mjs';
import { providerConfig } from './studio/provider-settings.mjs';
import { renderVoiceChapter } from './studio/voice-cache.mjs';
import { loadEnv } from './community/env.mjs';
try{await loadEnv();const [id,snapshot]=process.argv.slice(2),store=new ReleaseStore();if(!validName(snapshot))throw new Error('Invalid voice request.');const r=await store.get(id),spec=JSON.parse(await readFile(join(store.folder(id),snapshot),'utf8')),privateCfg=await providerConfig('elevenlabs'),config={...privateCfg,voiceId:spec.voiceId,model:spec.model,voiceSettings:spec.voiceSettings},files=[];for(const chapter of spec.chapters){console.log('Generating chapter '+(chapter.index+1));files.push({chapter:chapter.index,...await renderVoiceChapter(join(store.root,'projects',r.researchId),chapter.text,config,{audition:spec.audition,allowUncertain:spec.allowUncertain,cacheDir:join(store.root,'voice','.eleven-cache')})});}console.log(JSON.stringify({ok:true,files}));}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}

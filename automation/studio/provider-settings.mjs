import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { lockConfig, unlockConfig } from './credential-store.mjs';
export const CONFIG_FILE = fileURLToPath(new URL('../config.json', import.meta.url));
export const PROVIDERS = {
  gemini: { label:'Google Gemini', env:'GEMINI_API_KEY', model:'gemini-3.8-flash', fields:['model','writerModel','imageModel'] },
  openai: { label:'OpenAI', env:'OPENAI_API_KEY', model:'gpt-4o-mini', fields:['model'] },
  anthropic: { label:'Anthropic', env:'ANTHROPIC_API_KEY', model:'claude-sonnet-4-6', fields:['model'] },
  deepseek: { label:'DeepSeek', env:'DEEPSEEK_API_KEY', model:'deepseek-chat', fields:['model'] },
  xai: { label:'xAI / Grok', env:'XAI_API_KEY', model:'', fields:['model'] },
  local: { label:'LM Studio', model:'local-model', fields:['model','baseUrl'] },
  elevenlabs: { label:'ElevenLabs voice', env:'ELEVENLABS_API_KEY', model:'eleven_multilingual_v2', fields:['model','voiceId'] },
  deepgram: { label:'Deepgram transcription', env:'DEEPGRAM_API_KEY', model:'nova-3', fields:['model'] },
};
export const CHAT_PROVIDERS = ['gemini','openai','anthropic','deepseek','xai','local'];
export async function readSettings(file=CONFIG_FILE) { try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw new Error('Provider configuration could not be read.');} }
export function redactSettings(cfg, env=process.env) {
  return { taskDefaults:cfg.taskDefaults||{}, credentialStorage:"Windows user protection", defaultProvider:cfg.studioProvider || cfg.order?.[0] || 'gemini', providers:Object.entries(PROVIDERS).map(([id,p])=>({id,label:p.label,configured:id==='local'||Boolean(env[p.env]||cfg[id]?.apiKey||cfg[id]?.apiKeyProtected),source:p.env&&env[p.env]?'environment':cfg[id]?.apiKeyProtected?'Windows protected':cfg[id]?.apiKey?'local configuration':'not set',values:Object.fromEntries(p.fields.map(field=>[field,cfg[id]?.[field]|| (field==='model'?p.model:field==='baseUrl'?'http://localhost:1234/v1':field==='imageModel'?'gemini-3.1-flash-image':'')]))})) };
}
let saving=Promise.resolve();
export function saveSettings(patch,file=CONFIG_FILE) {
  const work=saving.catch(()=>{}).then(async()=>{
    if(!patch||!Object.hasOwn(PROVIDERS,patch.provider))throw new Error('Choose a supported provider.');
    const cfg=await readSettings(file), id=patch.provider, spec=PROVIDERS[id];
    const next={...(cfg[id]||{})};
    for(const field of spec.fields) if(Object.hasOwn(patch,field)){
      if(typeof patch[field]!=='string'||patch[field].length>300||/[\r\n]/.test(patch[field]))throw new Error('Invalid provider setting.');
      next[field]=patch[field].trim();
    }
    if(id==='local'&&next.baseUrl){const u=new URL(next.baseUrl);if(!['http:','https:'].includes(u.protocol)||!['localhost','127.0.0.1','[::1]'].includes(u.hostname))throw new Error('LM Studio must use a loopback URL.');}
    if(patch.apiKey){if(typeof patch.apiKey!=='string'||patch.apiKey.length>1000||/[\r\n]/.test(patch.apiKey))throw new Error('Invalid API key.');next.apiKey=patch.apiKey.trim();}
    if(patch.clearKey===true){delete next.apiKey;delete next.apiKeyProtected;}
    if(patch.makeDefault===true){if(!CHAT_PROVIDERS.includes(id))throw new Error('This provider is for audio, not chat.');cfg.studioProvider=id;cfg.order=[id,...(cfg.order||CHAT_PROVIDERS).filter(x=>x!==id)];}
    cfg[id]=next;
    if(patch.taskDefaults){cfg.taskDefaults={...(cfg.taskDefaults||{})};for(const [task,s] of Object.entries(patch.taskDefaults)){if(!['writing','checking','chat','images','narration'].includes(task)||!s||!Object.hasOwn(PROVIDERS,s.provider)||typeof s.model!=='string'||s.model.length>200)throw new Error('Invalid task default.');if(['writing','checking','chat'].includes(task)&&!CHAT_PROVIDERS.includes(s.provider)||task==='images'&&s.provider!=='gemini'||task==='narration'&&s.provider!=='elevenlabs')throw new Error('That provider cannot perform the selected task.');cfg.taskDefaults[task]={provider:s.provider,model:s.model.trim()};}}
    const protectedCfg=await lockConfig(cfg);
    const tmp=`${file}.${process.pid}.tmp`;
    try{await writeFile(tmp,JSON.stringify(protectedCfg,null,2)+'\n',{mode:0o600});await rename(tmp,file);}finally{await unlink(tmp).catch(()=>{});}
    return redactSettings(protectedCfg);
  });saving=work;return work;
}
export async function providerConfig(id) {const cfg=await unlockConfig(await readSettings());const p=PROVIDERS[id];if(!p)throw new Error('Unknown provider.');return{...cfg[id],apiKey:process.env[p.env]||cfg[id]?.apiKey||'',model:(id==='elevenlabs'?cfg.taskDefaults?.narration?.model:null)||cfg[id]?.model||p.model};}
export async function testProvider(id,fetcher=fetch){
  const p=await providerConfig(id);if(id!=='local'&&!p.apiKey)throw new Error('Save an API key first.');
  const endpoints={gemini:'https://generativelanguage.googleapis.com/v1beta/models',openai:'https://api.openai.com/v1/models',anthropic:'https://api.anthropic.com/v1/models',deepseek:'https://api.deepseek.com/models',xai:'https://api.x.ai/v1/models',elevenlabs:'https://api.elevenlabs.io/v1/voices',deepgram:'https://api.deepgram.com/v1/projects',local:(p.baseUrl||'http://localhost:1234/v1')+'/models'};
  const headers=id==='gemini'?{'x-goog-api-key':p.apiKey}:id==='anthropic'?{'x-api-key':p.apiKey,'anthropic-version':'2023-06-01'}:id==='elevenlabs'?{'xi-api-key':p.apiKey}:id==='deepgram'?{Authorization:`Token ${p.apiKey}`}:{Authorization:`Bearer ${p.apiKey}`};
  const r=await fetcher(endpoints[id],{headers,signal:AbortSignal.timeout(15000)});
  if(!r.ok){await r.body?.cancel();throw new Error(connectionError(r.status));}
  const data=await r.json(), voices=id==='elevenlabs'?(data.voices||[]).map(v=>({id:v.voice_id,name:v.name})):undefined;
  let catalogData=data;
  if(['elevenlabs','deepgram'].includes(id)){try{const modelResponse=await fetcher(id==='elevenlabs'?'https://api.elevenlabs.io/v1/models':'https://api.deepgram.com/v1/models',{headers,signal:AbortSignal.timeout(15000)});if(modelResponse.ok)catalogData=await modelResponse.json();else await modelResponse.body?.cancel();}catch{/* Keep the verified connection and allow manual model IDs. */}}
  const available=Array.isArray(catalogData)?catalogData:catalogData.stt||catalogData.models||catalogData.data||[];
  const models=[...new Map(available.filter(m=>m.can_do_text_to_speech!==false).map(m=>({id:(m.model_id||m.canonical_name||m.id||m.name||'').replace(/^models\//,''),name:m.displayName||m.display_name||m.name||m.id||m.model_id})).filter(m=>m.id).map(m=>[m.id,m])).values()];
  const missingVoice=id==='elevenlabs'&&(!p.voiceId||!voices.some(v=>v.id===p.voiceId));
  const missingModel=models.length&&p.model&&!models.some(m=>m.id===p.model);
  return{ok:true,message:missingVoice?'Connected. Select one of your available voices, then save.':missingModel?'Connected, but the saved model is not listed for this account. Choose a listed model or verify the manual ID.':'Connected. Saved selections are ready for review.',voices,models,selectedVoiceAvailable:voices?.some(v=>v.id===p.voiceId),selectedModelAvailable:models.length?models.some(m=>m.id===p.model):null};
}
export function connectionError(status){return`Connection check returned HTTP ${status}. `+({401:'The key is invalid or expired. Replace it in settings.',403:'The key lacks permission for this service. Check the provider account.',402:'Credits or billing are required. Check your provider balance.',404:'The selected model or voice is unavailable. Choose an available ID.',429:'Rate limit or quota reached. Check credits and retry after the provider limit resets.'}[status]||'The provider is unavailable. Try again later.');}

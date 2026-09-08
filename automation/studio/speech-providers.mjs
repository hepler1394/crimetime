// API adapters keep keys server-side and return media or transcript data only.
export function speechChunks(text,limit=3500){
  const chunks=[];let rest=String(text).trim();
  while(rest.length){let end=Math.min(limit,rest.length);if(end<rest.length){const boundary=rest.lastIndexOf(' ',end);if(boundary>limit/2)end=boundary;}chunks.push(rest.slice(0,end));rest=rest.slice(end).trim();}return chunks;
}
export async function elevenSpeech(text,config,fetcher=fetch){
  if(!config.apiKey||!config.voiceId)throw new Error('Set the ElevenLabs key and voice ID in Provider settings.');
  const voice_settings={};for(const [key,min,max] of [['stability',0,1],['similarity_boost',0,1],['style',0,1],['speed',0.7,1.2]])if(config.voiceSettings?.[key]!==undefined){const value=Number(config.voiceSettings[key]);if(!Number.isFinite(value)||value<min||value>max)throw new Error('Invalid voice control: '+key);voice_settings[key]=value;}
  if(config.model==='eleven_v3'){for(const key of ['similarity_boost','style','speed'])delete voice_settings[key];if(voice_settings.stability!==undefined)voice_settings.stability=Math.round(voice_settings.stability*2)/2;}
  const r=await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':config.apiKey,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:config.model||'eleven_multilingual_v2',...(Object.keys(voice_settings).length?{voice_settings}:{})}),signal:AbortSignal.timeout(180000)});
  if(!r.ok){await r.body?.cancel();throw new Error(`ElevenLabs returned HTTP ${r.status}. Check the voice, key, model and available credits.`);}return Buffer.from(await r.arrayBuffer());
}
export async function deepgramTranscript(audio,config,fetcher=fetch){
  if(!config.apiKey)throw new Error('Set the Deepgram key in Provider settings.');
  const q=new URLSearchParams({model:config.model||'nova-3',smart_format:'true',utterances:'true',diarize:'true'});
  const r=await fetcher(`https://api.deepgram.com/v1/listen?${q}`,{method:'POST',headers:{Authorization:`Token ${config.apiKey}`,'Content-Type':'audio/mpeg'},body:audio,signal:AbortSignal.timeout(600000)});
  if(!r.ok){await r.body?.cancel();throw new Error(`Deepgram returned HTTP ${r.status}. Check the key, model and available credits.`);}
  const data=await r.json(), alt=data.results?.channels?.[0]?.alternatives?.[0];
  if(!alt)throw new Error('Deepgram returned no transcript.');
  const segments=data.results?.utterances?.map(u=>({start:u.start,end:u.end,text:u.transcript,speaker:u.speaker})) || (alt.words||[]).map(w=>({start:w.start,end:w.end,text:w.punctuated_word||w.word,speaker:w.speaker}));
  const words=(alt.words||[]).map(w=>({start:w.start,end:w.end,text:w.punctuated_word||w.word,speaker:w.speaker,confidence:w.confidence}));
  return{language:'en',model:config.model||'nova-3',duration:data.metadata?.duration||0,generated:new Date().toISOString(),segments,words,text:alt.transcript||''};
}

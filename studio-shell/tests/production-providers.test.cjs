const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
test('provider settings preserve unrelated config, redact keys and validate local endpoints',async()=>{
 const {saveSettings,redactSettings,readSettings}=await import('../../automation/studio/provider-settings.mjs');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cts-settings-')),file=path.join(dir,'config.json');
 try{await fs.writeFile(file,JSON.stringify({custom:{keep:true},openai:{apiKey:'test-old-secret'}}));
 await saveSettings({provider:'elevenlabs',apiKey:'test-eleven-secret',voiceId:'voice-test',model:'eleven_multilingual_v2'},file);
 await saveSettings({provider:'openai',apiKey:'',model:'test-model',makeDefault:true},file);
 const raw=await readSettings(file);assert.equal(raw.custom.keep,true);assert.equal(raw.openai.apiKey,undefined);assert.ok(raw.openai.apiKeyProtected);const {unlockConfig}=await import('../../automation/studio/credential-store.mjs');assert.equal((await unlockConfig(raw)).openai.apiKey,'test-old-secret');assert.equal(raw.studioProvider,'openai');
 const publicData=JSON.stringify(redactSettings(raw,{}));assert.ok(!publicData.includes('test-old-secret'));assert.ok(!publicData.includes('test-eleven-secret'));
 await assert.rejects(()=>saveSettings({provider:'local',baseUrl:'https://example.com/v1'},file),/loopback/);
 await saveSettings({provider:'elevenlabs',clearKey:true},file);assert.ok(!(await readSettings(file)).elevenlabs.apiKey);
 }finally{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});}
});
test('speech adapters use provider-specific authentication and normalize timed transcripts',async()=>{
 const {speechChunks,elevenSpeech,deepgramTranscript}=await import('../../automation/studio/speech-providers.mjs');
 const text='A factual narration sentence. '.repeat(300),chunks=speechChunks(text);assert.ok(chunks.length>1);assert.ok(chunks.every(c=>c.length<=3500));assert.equal(chunks.join(' '),text.trim());
 const audio=await elevenSpeech('Test narration',{apiKey:'test-key',voiceId:'voice-one',model:'test-model'},async(url,opts)=>{assert.match(url,/text-to-speech\/voice-one/);assert.equal(opts.headers['xi-api-key'],'test-key');assert.equal(JSON.parse(opts.body).model_id,'test-model');return new Response(new Uint8Array([1,2,3]));});assert.equal(audio.length,3);
 const transcript=await deepgramTranscript(Buffer.from([1]),{apiKey:'test-key',model:'nova-3'},async(url,opts)=>{assert.match(url,/utterances=true/);assert.equal(opts.headers.Authorization,'Token test-key');return Response.json({metadata:{duration:3},results:{channels:[{alternatives:[{transcript:'The source.',words:[]}]}],utterances:[{start:0,end:2,transcript:'The source.',speaker:0}]}});});assert.equal(transcript.segments[0].end,2);assert.equal(transcript.text,'The source.');
 await assert.rejects(()=>elevenSpeech('text',{apiKey:'k',voiceId:'v'},async()=>new Response('secret provider body',{status:401})),/HTTP 401/);
});
test('production assistant accepts reviewable edits and refuses unsupported action suggestions',async()=>{
 const {parseAssistant}=await import('../../automation/studio/production-assistant.mjs');
 const r=parseAssistant(JSON.stringify({answer:'Review this.',script:['Chapter one'],caption:'Caption',actions:['publish','trailer','shell','deepgram']}));assert.deepEqual(r.actions,['trailer','deepgram']);assert.deepEqual(r.script,['Chapter one']);assert.equal(parseAssistant('A plain answer').answer,'A plain answer');
});
test('incomplete model replies are rejected and production Claude requests have script-sized output room',async()=>{
 const {chat}=await import('../../automation/llm.mjs');const originalFetch=global.fetch;
 try{
  global.fetch=async()=>new Response('data: {"choices":[{"delta":{"content":"unfinished"},"finish_reason":"length"}]}\n\n');
  await assert.rejects(()=>chat('system','question',{order:['openai'],openai:{apiKey:'test-key',baseUrl:'https://test.invalid',model:'test'}}),/output limit/);
  global.fetch=async(_url,options)=>{assert.equal(JSON.parse(options.body).max_tokens,8192);return Response.json({stop_reason:'end_turn',content:[{text:'Complete response'}]});};
  assert.equal((await chat('system','question',{order:['anthropic'],maxOutputTokens:8192,anthropic:{apiKey:'test-key',model:'test'}})).text,'Complete response');
 }finally{global.fetch=originalFetch;}
});

const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {_electron:electron}=require('D:/Dev/GitHub/ig-studio/node_modules/playwright');
test('Electron production suite: provider settings, script revisions, proposed edits and explicit job controls',{timeout:150000},async()=>{
 const repo=path.resolve(__dirname,'../..'),port=5700+Math.floor(Math.random()*200),base=`http://127.0.0.1:${port}`;
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'cts-production-ui-'));
 const id=`cts-production-check-${Date.now()}`,draftRoot=path.join(repo,'automation/studio/drafts'),dir=path.join(draftRoot,id);
 const headers={'X-CTS':'1','Content-Type':'application/json'};
 await fs.mkdir(dir);const original={id,title:'Production workflow check',status:'scripted',script:['The source establishes the date.'],factsToVerify:['Date verified'],factsChecked:[true],created:new Date().toISOString(),files:{}};await fs.writeFile(path.join(dir,'episode.json'),JSON.stringify(original));
 const server=spawn(process.execPath,[path.join(repo,'automation/studio/server.mjs')],{env:{...process.env,STUDIO_PORT:String(port)},stdio:'ignore',windowsHide:true});let app;
 try{
  for(let i=0;i<60;i++){try{if((await fetch(base+'/api/drafts')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  const publicSettings=await(await fetch(base+'/api/settings')).json();assert.ok(publicSettings.providers.length>=8);assert.ok(publicSettings.providers.every(p=>!Object.hasOwn(p,'apiKey')));
  assert.equal((await fetch(base+'/api/settings',{method:'PUT',body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/settings',{method:'PUT',headers,body:'{"provider":"unsupported"}'})).status,400);
  const env={...process.env,CTS_TEST_PROFILE:profile,CTS_TEST_URL:base+'/workspace'};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'fixtures/workspace-window.cjs')],env});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-view="script"]').click();await page.locator('#view-script [data-production-episode]').selectOption(id);
  await page.waitForFunction(()=>document.querySelector('#script-body').value.includes('source establishes'));
  await page.locator('#script-body').fill('The source establishes the date. The edited passage is ready for review.');await page.locator('#script-save').click();
  await page.waitForFunction(()=>document.querySelector('#script-state').textContent.includes('previous script kept'));
  const saved=JSON.parse(await fs.readFile(path.join(dir,'episode.json'),'utf8'));assert.equal(saved.factsChecked[0],false);
  const revisions=await(await fetch(base+`/api/draft/${id}/revisions`)).json();assert.equal(revisions.length,1);
  const before=await(await fetch(base+`/api/draft/${id}/revisions?name=${revisions[0]}`)).json();assert.equal(before.script[0],original.script[0]);
  const conflict=await fetch(base+`/api/draft/${id}`,{method:'PUT',headers,body:JSON.stringify({expectedEdited:original.created,script:['Stale overwrite']})});assert.equal(conflict.status,409);
  await page.locator('#script-read').click();await page.locator('#read-copy').waitFor();await page.locator('#read-close').click();
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(os.tmpdir(),'crimetime-script-editor.png'),fullPage:false});
  let assistantRequest;
  await page.route('**/conversation',route=>{if(route.request().method()==='GET')return route.continue();assistantRequest=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'test-answer',at:new Date().toISOString(),question:assistantRequest.question,provider:'test model',answer:'Here is a proposed opening and caption. Review them before saving.',script:['A proposed opening, based on the saved source.'],caption:'A sourced caption for review.',actions:['trailer']})});});
  await page.locator('[data-view="assistant"]').click();await page.locator('#production-question').fill('Improve the opening and write an Instagram caption.');await page.locator('#production-send').click();
  await page.locator('[data-apply-script]').waitFor();assert.match(assistantRequest.question,/Instagram/);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(os.tmpdir(),'crimetime-production-chat.png'),fullPage:false});
  await page.locator('[data-apply-script]').click();assert.match(await page.locator('#script-body').inputValue(),/proposed opening/);
  assert.ok(!JSON.parse(await fs.readFile(path.join(dir,'episode.json'),'utf8')).script[0].includes('proposed opening'));
  await page.locator('#script-save').click();await page.waitForFunction(()=>document.querySelector('#script-state').textContent.includes('previous script kept'));
  const jobs=[];await page.route('**/api/run',route=>{jobs.push(route.request().postDataJSON());return route.fulfill({status:202,contentType:'application/json',body:'{"id":"test-job"}'});});
  await page.locator('[data-view="assistant"]').click();await page.locator('[data-production-action="elevenlabs"]').click();await page.locator('[data-production-action="deepgram"]').click();assert.deepEqual(jobs.map(j=>j.action),['elevenlabs','deepgram']);assert.ok(jobs.every(j=>j.id===id));
  await page.locator('[data-view="settings"]').click();await page.locator('[data-provider="elevenlabs"]').click();
  let patch;await page.route('**/api/settings',route=>{if(route.request().method()!=='PUT')return route.continue();patch=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(publicSettings)});});
  await page.locator('#provider-key').fill('test-ui-key');await page.locator('#setting-voiceId').fill('test-voice');await page.locator('#provider-save').click();await page.waitForFunction(()=>document.querySelector('#provider-result').textContent.includes('Settings saved'));
  assert.equal(patch.apiKey,'test-ui-key');assert.equal(patch.voiceId,'test-voice');assert.equal(await page.locator('#provider-key').inputValue(),'');
  await page.route('**/api/settings/test',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"message":"Connected to test provider","voices":[{"id":"voice-two","name":"Test voice"}]}'}));
  await page.locator('#provider-test').click();await page.locator('#available-voice').selectOption('voice-two');assert.equal(await page.locator('#setting-voiceId').inputValue(),'voice-two');
  // Provider settings were visually reviewed separately; assertions here cover the live controls.
  assert.deepEqual(errors,[]);await page.setViewportSize({width:1100,height:740});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }catch(e){if(app){const pages=app.context().pages();await pages[0]?.screenshot({path:path.join(os.tmpdir(),'crimetime-production-failure.png'),fullPage:false}).catch(()=>{});}throw e;}finally{
  if(app)await app.evaluate(({BrowserWindow})=>{for(const w of BrowserWindow.getAllWindows())w.destroy();}).catch(()=>{});
  await app?.close().catch(()=>{});server.kill();
  assert.ok(path.resolve(dir).startsWith(path.resolve(draftRoot)+path.sep));await fs.rm(dir,{recursive:true,force:true});
  assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(profile,{recursive:true,force:true});
 }
});

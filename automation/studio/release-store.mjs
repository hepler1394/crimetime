import { mkdir, readFile, writeFile, rename, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE=fileURLToPath(new URL('.',import.meta.url));
export const validId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9-]{0,120}$/.test(id);
export const validName=name=>typeof name==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,120}$/.test(name)&&!name.includes('..');
export const jsonFile=async(file,fallback=null)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
export async function atomicJson(file,data){const tmp=file+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{mode:0o600});await rename(tmp,file);}
export function claimStatus(claim,script,slides=[]){const text=claim.target==='carousel'?slides.map(s=>s.text||'').join('\n'):script.join('\n');return claim.verified&&claim.verifiedText===claim.text&&Boolean(claim.source)&&text.includes(claim.text)?'verified':'unresolved';}
export class ReleaseStore{
  constructor(root=HERE){this.root=root;this.dir=join(root,'releases');this.locks=new Map();this.hashes=new Map();}
  folder(id){if(!validId(id))throw new Error('Invalid release ID.');return join(this.dir,id);}
  async list(){await mkdir(this.dir,{recursive:true});const out=[];for(const id of await readdir(this.dir)){if(!validId(id))continue;const r=await jsonFile(join(this.folder(id),'release.json'));if(r)out.push({id:r.id,title:r.title,episodeId:r.episodeId,researchId:r.researchId,updated:r.updated});}return out.sort((a,b)=>b.updated.localeCompare(a.updated));}
  async get(id){const r=await jsonFile(join(this.folder(id),'release.json'));if(!r)throw new Error('Release project not found.');return r;}
  async create({title,episodeId,researchId}){
    title=String(title||'').trim().slice(0,200);if(!title)throw new Error('Name this release.');
    const id='release-'+randomUUID();
    for(const [key,kind,meta] of [[episodeId,'drafts','episode.json'],[researchId,'projects','project.json']])if(key&&(!validId(key)||!await jsonFile(join(this.root,kind,key,meta))))throw new Error('The linked episode or research folder was not found.');
    const now=new Date().toISOString();
    if(!researchId){researchId=id;await mkdir(join(this.root,'projects',id),{recursive:true});await atomicJson(join(this.root,'projects',id,'project.json'),{id,title,created:now,updated:now});await writeFile(join(this.root,'projects',id,'notes.md'),'');}
    if(!episodeId){episodeId=id;const slug=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,70)+'-'+id.slice(-8);await mkdir(join(this.root,'drafts',id),{recursive:true});await atomicJson(join(this.root,'drafts',id,'episode.json'),{id,title,slug,description:'',created:now,status:'scripted',script:[],files:{},factsToVerify:[],factsChecked:[]});}
    const r={version:1,id,title,episodeId,researchId,postIds:[],created:now,updated:now,revision:0,account:'crimetimesnacks',claims:[],chapterMeta:[],timeline:{version:1,sampleRate:48000,tracks:[],revision:0},brand:{cover:null,logo:null,fonts:[],approved:[],templates:[]},carousel:{slides:[],caption:'',template:'crime'},storyboard:{scenes:[],format:'portrait',endCard:'',music:null},assets:{},transcript:null,showNotes:'',releaseReview:{}};
    await mkdir(this.folder(id),{recursive:true});await atomicJson(join(this.folder(id),'release.json'),r);return r;
  }
  async update(id,patch){const previous=this.locks.get(id)||Promise.resolve();const work=previous.catch(()=>{}).then(async()=>{
    const r=await this.get(id);if(patch.expectedRevision!==r.revision)throw new Error('Project changed in another window. Reload before saving.');
    const keys=['title','account','postIds','claims','chapterMeta','timeline','brand','carousel','storyboard','assets','transcript','showNotes','releaseReview','voiceBooth'];
    for(const key of keys)if(Object.hasOwn(patch,key))r[key]=patch[key];
    if(typeof r.title!=='string'||!r.title.trim()||r.title.length>200||!/^@?[a-zA-Z0-9._]{1,30}$/.test(r.account))throw new Error('Enter a title and a valid Instagram account.');
    if(!Array.isArray(r.postIds)||r.postIds.some(id=>!validId(id))||!Array.isArray(r.claims)||r.claims.length>1000||!Array.isArray(r.chapterMeta))throw new Error('Invalid project data.');
    if(!r.brand||!Array.isArray(r.brand.approved)||!r.carousel||!Array.isArray(r.carousel.slides)||r.carousel.slides.length>20||!r.storyboard||!Array.isArray(r.storyboard.scenes))throw new Error('Invalid media composition.');
    if(!r.timeline||!Array.isArray(r.timeline.tracks)||r.timeline.tracks.length>32)throw new Error('Use at most 32 audio tracks.');
    for(const claim of r.claims){if(typeof claim.text!=='string'||claim.text.length>10000||typeof claim.source!=='string'||!['script','carousel'].includes(claim.target))throw new Error('Invalid claim.');if(claim.source&&!/^https?:\/\//i.test(claim.source))throw new Error('Sources must use an http or https link.');const old=(await this.get(id)).claims.find(c=>c.id===claim.id);if(old&&(old.text!==claim.text||old.source!==claim.source)){claim.verified=false;delete claim.verifiedText;}else if(claim.verified)claim.verifiedText=claim.text;}
    const old=await this.get(id);const removed=old.claims.filter(c=>!r.claims.some(n=>n.id===c.id));if(removed.length)r.claimHistory=[...(old.claimHistory||[]),...removed.map(c=>({...c,archivedAt:new Date().toISOString()}))];if(JSON.stringify({...r.timeline,revision:0,changedAt:null})!==JSON.stringify({...old.timeline,revision:0,changedAt:null})){r.timeline.revision=(old.timeline.revision||0)+1;r.timeline.changedAt=Date.now();if(r.transcript)r.transcript.stale=true;}
    if(r.account!==old.account)r.releaseReview.accountConfirmed=false;
    if(JSON.stringify(r.carousel.slides)!==JSON.stringify(old.carousel.slides)||r.carousel.caption!==old.carousel.caption){delete r.carousel.exportedAt;delete r.carousel.exportedPostId;}
    r.revision++;r.updated=new Date().toISOString();await atomicJson(join(this.folder(id),'release.json'),r);return r;
    });this.locks.set(id,work);try{return await work;}finally{if(this.locks.get(id)===work)this.locks.delete(id);}}
  async episode(r){return jsonFile(join(this.root,'drafts',r.episodeId,'episode.json'),{});}
  async inventory(id){const r=await this.get(id),items=[];const locations=[['draft',r.episodeId,'drafts'],['project',r.researchId,'projects'],...r.postIds.map(p=>['post',p,'posts'])];
    for(const [type,owner,folder] of locations){const dir=join(this.root,folder,owner);for(const name of await readdir(dir).catch(()=>[])){if(!validName(name)||/^(episode|project|chat|production-chat|post)\.json$/.test(name))continue;const file=join(dir,name),s=await stat(file);if(!s.isFile())continue;const key=type+':'+owner+':'+name;items.push({...r.assets[key],key,type,id:owner,name,size:s.size,modified:s.mtimeMs,url:`/api/${type}/${encodeURIComponent(owner)}/file?name=${encodeURIComponent(name)}`});}}
    return items;
  }
  async assetPath(id,key){const asset=(await this.inventory(id)).find(a=>a.key===key);if(!asset)throw new Error('Choose a file from this release project.');const folder={draft:'drafts',project:'projects',post:'posts'}[asset.type];const base=resolve(this.root,folder,asset.id),path=resolve(base,asset.name);if(!path.startsWith(base+'\\')&&!path.startsWith(base+'/'))throw new Error('Invalid asset location.');return{asset,path};}
  async duplicates(id){const items=await this.inventory(id),groups=new Map();for(const a of items){const stamp=a.key+':'+a.size+':'+a.modified;let hash=this.hashes.get(stamp);if(!hash){const {path}=await this.assetPath(id,a.key);const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);hash=h.digest('hex');this.hashes.set(stamp,hash);}if(!groups.has(hash))groups.set(hash,[]);groups.get(hash).push(a.key);}return [...groups.values()].filter(g=>g.length>1);}
  async replaceAsset(id,oldKey,newKey){const r=await this.get(id);const old=await this.assetPath(id,oldKey),next=await this.assetPath(id,newKey);if(oldKey===newKey)throw new Error('Choose a different version.');const family=n=>/\.(png|jpe?g|webp)$/i.test(n)?'image':/\.(wav|mp3|m4a|ogg|webm)$/i.test(n)?'audio':/\.mp4$/i.test(n)?'video':'document';if(family(old.asset.name)!==family(next.asset.name))throw new Error('The replacement must be the same media type.');const swap=key=>key===oldKey?newKey:key,assets={...r.assets,[newKey]:{...r.assets[oldKey],replaces:oldKey,version:(r.assets[oldKey]?.version||1)+1},[oldKey]:{...r.assets[oldKey],supersededBy:newKey}};return this.update(id,{expectedRevision:r.revision,assets,brand:{...r.brand,cover:swap(r.brand.cover),logo:swap(r.brand.logo),approved:r.brand.approved.map(swap)},timeline:{...r.timeline,tracks:r.timeline.tracks.map(t=>({...t,clips:t.clips.map(c=>({...c,asset:swap(c.asset)}))}))},carousel:{...r.carousel,slides:r.carousel.slides.map(s=>({...s,image:swap(s.image)}))},storyboard:{...r.storyboard,music:swap(r.storyboard.music),scenes:r.storyboard.scenes.map(s=>({...s,image:swap(s.image),audio:swap(s.audio)}))}});}
  async readiness(id){const r=await this.get(id),ep=await this.episode(r),assets=await this.inventory(id);const has=n=>assets.some(a=>a.type==='draft'&&a.name===n);const notes=await readFile(join(this.root,'projects',r.researchId,'notes.md'),'utf8').catch(()=>'');const unresolved=r.claims.filter(c=>claimStatus(c,ep.script||[],r.carousel.slides)!=='verified');const oldFacts=(ep.factsToVerify||[]).filter((_,i)=>!ep.factsChecked?.[i]);
    const stages=[['Research',Boolean(notes.trim()||has('research.md')),'documents','Save research notes or sources.'],['Script',Boolean(ep.script?.some(s=>s.trim())),'script','Write and save the episode script.'],['Record',has('episode.mp3')||assets.some(a=>/take-.*\.(webm|wav)$/.test(a.name)),'recording','Record or generate narration.'],['Edit',has('episode.mp3')||assets.some(a=>a.name.startsWith('mix-')),'mix','Save an edited audio mix.'],['Artwork',Boolean(r.brand.cover&&assets.some(a=>a.key===r.brand.cover)),'brand','Select approved cover art.'],['Social',Boolean(r.carousel.slides.length&&r.carousel.caption.trim()),'carousel','Compose slides and a caption.'],['Facts',unresolved.length+oldFacts.length===0,'claims',`${unresolved.length+oldFacts.length} unresolved claims.`],['Release',Boolean(r.showNotes.trim()),'release','Write show notes and review the package.']];
    return{stages:stages.map(([label,ready,view,reason])=>({label,ready,view,reason})),unresolved,legacyFacts:oldFacts};
  }
}

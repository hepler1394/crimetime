import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const alive = pid => { if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch{return false;} };
export function writeJob(file,job){const tmp=file+'.tmp';writeFileSync(tmp,JSON.stringify(job),{mode:0o600});renameSync(tmp,file);}
const SERIAL=new Set(['new','draft','research','weekly']);
const VOICE=new Set(['elevenlabs','release-voice']);
export class ProductionQueue {
  constructor(dir,{poll=1000}={}) {this.dir=dir;this.jobs=new Map();mkdirSync(dir,{recursive:true});this.refresh();this.timer=setInterval(()=>this.refresh(),poll);this.timer.unref();}
  refresh(){
    for(const f of readdirSync(this.dir).filter(f=>/^j-[a-f0-9-]+\.json$/.test(f))){
      let job;try{job=JSON.parse(readFileSync(join(this.dir,f),'utf8'));}catch{continue;}
      if(job.state==='running'&&!alive(job.workerPid)&&!alive(job.childPid)&&Date.now()-job.started>10000){job.state='interrupted';job.done=true;job.code=-1;job.finished=Date.now();job.log+='\nInterrupted. Review saved outputs before requesting a retry.';writeJob(join(this.dir,f),job);}
      this.jobs.set(job.id,job);
    }
    const ordered=[...this.jobs.values()].sort((a,b)=>a.created-b.created);this.jobs.clear();ordered.forEach(j=>this.jobs.set(j.id,j));
    for(const job of ordered.filter(j=>j.state==='queued')){
      const active=ordered.filter(j=>j.state==='running');
      if(active.some(j=>j.draft&&j.draft===job.draft||SERIAL.has(job.action)&&SERIAL.has(j.action)||VOICE.has(job.action)&&VOICE.has(j.action)))continue;
      job.state='running';job.started=Date.now();writeJob(this.file(job.id),job);
      const worker=spawn(process.execPath,[fileURLToPath(new URL('./job-worker.mjs',import.meta.url)),this.file(job.id)],{windowsHide:true,detached:true,stdio:'ignore',env:{...process.env,FORCE_COLOR:'0',PYTHONIOENCODING:'utf-8'}});worker.unref();
      worker.on('error',()=>{job.state='failed';job.done=true;job.code=-1;job.log='Job worker could not start.';writeJob(this.file(job.id),job);});
    }
  }
  file(id){return join(this.dir,id+'.json');}
  enqueue(action,args,spec){const job={id:'j-'+randomUUID(),action,draft:args.lockId||args.id||null,args,spec,created:Date.now(),started:null,done:false,code:null,log:'',result:null,state:'queued'};writeJob(this.file(job.id),job);this.jobs.set(job.id,job);this.refresh();return this.jobs.get(job.id);}
  retry(id,acknowledge=false){this.refresh();const old=this.jobs.get(id);if(!old||!['failed','interrupted'].includes(old.state))throw new Error('Only failed or interrupted jobs can be retried.');if(alive(old.workerPid)||alive(old.childPid))throw new Error('The original process is still running.');if(!acknowledge)throw new Error('Review outputs and acknowledge that retrying may use provider credits.');if(['publish','content','weekly'].includes(old.action))throw new Error('Use the reviewed publishing flow for this action.');return this.enqueue(old.action,old.args,old.spec);}
  close(){clearInterval(this.timer);}
}
export function publicJob({args,spec,workerPid,childPid,...job}){return job;}

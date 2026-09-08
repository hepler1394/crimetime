import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { loadConfig } from '../llm.mjs';
import { writeJob } from './job-queue.mjs';
const file=process.argv[2], job=JSON.parse(readFileSync(file,'utf8'));
job.workerPid=process.pid;job.state='running';writeJob(file,job);
const secretValues=Object.entries(process.env).filter(([k,v])=>/KEY|TOKEN|SECRET|PASSWORD/.test(k)&&v?.length>8).map(([,v])=>v);
try{const cfg=await loadConfig();for(const v of Object.values(cfg))if(v?.apiKey?.length>8)secretValues.push(v.apiKey);}catch{}
const child=spawn(process.execPath,job.spec.argv,{cwd:job.spec.cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});
job.childPid=child.pid;writeJob(file,job);
function sanitize(text){for(const key of secretValues)text=text.split(key).join('[redacted]');return text.replace(/(Bearer|Token)\s+[^\s"']+/gi,'$1 [redacted]').replace(/((?:api[_-]?key|x-goog-api-key)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,'$1[redacted]');}
const output=c=>{job.log=(job.log+sanitize(c.toString())).slice(-200000);};
child.stdout.on('data',output);child.stderr.on('data',output);
const interval=setInterval(()=>{job.heartbeat=Date.now();writeJob(file,job);},500);
function finish(code){clearInterval(interval);job.done=true;job.code=code;job.finished=Date.now();job.state=code===0?'complete':'failed';const line=job.log.trim().split('\n').reverse().find(l=>l.startsWith('{'));try{job.result=JSON.parse(line);}catch{}writeJob(file,job);}
child.on('error',()=>{job.log+='\nProduction process could not start.';});child.on('close',finish);

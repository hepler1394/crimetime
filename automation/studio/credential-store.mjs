import { spawn } from 'node:child_process';

// DPAPI is tied to this Windows user. Secrets travel over stdin, never argv.
// ErrorActionPreference Stop and the count check: without them a blob DPAPI refused was
// skipped, the script exited 0 with fewer values than it was given, and the caller got
// undefined for that key instead of an error.
//
// The deadline used to be 15 s and a timeout was reported as "Cannot unlock credentials for
// this Windows user", the same words as a key DPAPI really cannot open. On 2026-10-06 the
// Tuesday content run's gen-quiz died with that message minutes after ai-write had unlocked
// the same config in the same scheduled task: the machine was at 100% CPU under an audio
// render queue, and a cold Windows PowerShell plus Add-Type can take longer than 15 s to
// start then. A slow machine is not a lost key, so the two now say different things, the
// deadline is longer, and a timeout is tried once more.
const DEADLINE_MS = 60000;
export async function protectValues(values, decrypt = false, attempt = 1) {
  if (!values.length) return [];
  if (process.platform !== 'win32') throw new Error('Protected credentials require Windows. Use environment keys on this platform.');
  const operation = decrypt ? 'Unprotect' : 'Protect';
  const script = `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.Security; $items = [Console]::In.ReadToEnd() | ConvertFrom-Json; $result = @(); foreach ($item in $items) { $bytes = [Convert]::FromBase64String($item); $result += [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${operation}($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)) }; ConvertTo-Json -InputObject $result -Compress`;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
      let out = '', err = '', timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, DEADLINE_MS);
      child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
      child.on('error', () => { clearTimeout(timer); reject(new Error('Windows credential protection is unavailable. Nothing was saved.')); });
      child.on('close', code => {
        clearTimeout(timer);
        if (timedOut) return reject(Object.assign(new Error(`Windows credential protection did not answer within ${DEADLINE_MS / 1000} s (the machine is busy); the stored keys are fine.`), { timedOut: true }));
        if (code !== 0) {
          // stderr carries the .NET exception text, never a key (values go in on stdin and
          // only come back on stdout).
          const why = (err.match(/Exception[^\r\n]*|[^\r\n]*(key|data|parameter)[^\r\n]*/i) || [''])[0].trim().slice(0, 160);
          return reject(new Error(`Cannot unlock credentials for this Windows user${why ? ` (${why})` : ''}. Re-enter the key in settings.`));
        }
        try { const result=[JSON.parse(out)].flat(); if (result.length !== values.length) throw new Error('count'); resolve(decrypt?result.map(v=>Buffer.from(v,'base64').toString('utf8')):result); } catch { reject(new Error('Windows credential protection did not finish.')); }
      });
      child.stdin.on('error',()=>{});
      child.stdin.end(JSON.stringify(decrypt?values:values.map(v=>Buffer.from(v).toString('base64'))));
    });
  } catch (e) {
    if (e.timedOut && attempt < 2) return protectValues(values, decrypt, attempt + 1);
    throw e;
  }
}
export async function unlockConfig(raw) {
  const cfg=structuredClone(raw), ids=Object.keys(cfg).filter(id=>cfg[id]?.apiKeyProtected);
  const values=await protectValues(ids.map(id=>cfg[id].apiKeyProtected),true);
  ids.forEach((id,i)=>cfg[id].apiKey=values[i]); return cfg;
}
export async function lockConfig(raw) {
  const cfg=structuredClone(raw), ids=Object.keys(cfg).filter(id=>cfg[id]&&typeof cfg[id]==='object'&&typeof cfg[id].apiKey==='string'&&cfg[id].apiKey);
  const values=await protectValues(ids.map(id=>cfg[id].apiKey));
  ids.forEach((id,i)=>{cfg[id].apiKeyProtected=values[i];delete cfg[id].apiKey;});return cfg;
}

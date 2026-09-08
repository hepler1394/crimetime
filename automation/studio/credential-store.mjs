import { spawn } from 'node:child_process';

// DPAPI is tied to this Windows user. Secrets travel over stdin, never argv.
export async function protectValues(values, decrypt = false) {
  if (!values.length) return [];
  if (process.platform !== 'win32') throw new Error('Protected credentials require Windows. Use environment keys on this platform.');
  const operation = decrypt ? 'Unprotect' : 'Protect';
  const script = `Add-Type -AssemblyName System.Security; $items = [Console]::In.ReadToEnd() | ConvertFrom-Json; $result = @(); foreach ($item in $items) { $bytes = [Convert]::FromBase64String($item); $result += [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${operation}($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)) }; ConvertTo-Json -InputObject $result -Compress`;
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide:true, stdio:['pipe','pipe','pipe'] });
    let out = ''; const timer = setTimeout(() => child.kill(), 15000);
    child.stdout.on('data', d => out += d); child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('Windows credential protection is unavailable. Nothing was saved.')); });
    child.on('close', code => { clearTimeout(timer); if (code !== 0) return reject(new Error('Cannot unlock credentials for this Windows user. Re-enter the key in settings.')); try { const result=JSON.parse(out); resolve(decrypt?result.map(v=>Buffer.from(v,'base64').toString('utf8')):result); } catch { reject(new Error('Windows credential protection did not finish.')); } });
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify(decrypt?values:values.map(v=>Buffer.from(v).toString('base64'))));
  });
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

# CrimeTimeSnacks RE-VOICE (one-off, run as a scheduled task).
#
# Re-renders one draft's audio after its script changed, then tells Cory on the
# agent relay when it lands. Run it as a scheduled task rather than from a shell:
# a clone render takes four to five hours, and anything started from an agent
# session or a terminal dies with that session. That is not theoretical; it is
# why this file exists.
#
#   schtasks /create /tn "CTS Revoice" /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-revoice.ps1 -Id <draft-id>" /sc once /st <HH:mm> /f
#   schtasks /run /tn "CTS Revoice"
#
# Native commands run through cmd /c so Windows PowerShell 5.1 never sees their
# stderr (it would turn a harmless stderr line into a fatal error). See cts-content.ps1.
param([Parameter(Mandatory = $true)][string]$Id, [string]$Theme = "")
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
Add-Content -Path $log -Value "$(Get-Date -Format o)  REVOICE START $Id" -Encoding UTF8

$themeArg = if ($Theme) { "--theme $Theme" } else { "" }
cmd /c "node automation\episode-voice.mjs $Id $themeArg >> ""$log"" 2>&1"
$code = $LASTEXITCODE

if ($code -eq 0) {
    Add-Content -Path $log -Value "$(Get-Date -Format o)  REVOICE OK $Id" -Encoding UTF8
    $msg = "Claude: the re-render of $Id finished. Open the studio (npm run studio) to tick the fact list. The reel and trailer are built from the old audio, so re-cut them first: node automation/episode-social.mjs $Id"
} else {
    Add-Content -Path $log -Value "$(Get-Date -Format o)  REVOICE ERROR $Id  node exited $code (read the lines above)" -Encoding UTF8
    $msg = "Claude: the re-render of $Id FAILED, node exited $code. The reason is in automation/cron/cron.log."
}

# Tell Cory. The relay reaches his phone through Cortex; a failure to notify must
# not look like a failure to render, so this is reported separately.
$env:CTS_REVOICE_MSG = $msg
cmd /c "node -e ""const fs=require('fs');const k=fs.readFileSync('C:/Users/cory/AppData/Local/hermes/relay-key.txt','utf8').trim();fetch('https://cortex-relay.vercel.app',{method:'POST',headers:{'x-relay-key':k,'content-type':'application/json'},body:JSON.stringify({agent:'claude',to:'cory',body:process.env.CTS_REVOICE_MSG})}).then(r=>r.json()).then(j=>console.log('relay',j.id||j.error))"" >> ""$log"" 2>&1"

exit $code

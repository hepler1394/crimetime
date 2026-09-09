# CrimeTimeSnacks RE-VOICE (one-off, run on demand as a scheduled task).
#
# Re-renders one draft's audio after its script changed, then tells Cory on the
# agent relay when it lands. A clone render takes four to five hours.
#
# Why a task and not a shell: the danger with a job this long is not that it dies,
# it is that a second one starts. Both instances share the draft's tts/ work folder,
# both master the episode from it, and whichever finishes first deletes the folder
# out from under the other. Registering this as a task with MultipleInstances
# IgnoreNew makes that impossible, and the task keeps running regardless of what
# started it. Two renders did once run concurrently on one draft; the audio survived,
# but only by luck.
#
# Register it WITHOUT a trigger and start it by hand. A "/sc once /st HH:mm" trigger
# plus an immediate run is what started two instances in the first place: the manual
# run goes first and the trigger fires a second one underneath it minutes later.
#
#   $action = New-ScheduledTaskAction -Execute "powershell.exe" `
#     -Argument '-NoProfile -ExecutionPolicy Bypass -File "D:\dev\github\crimetime\automation\cron\cts-revoice.ps1" -Id <draft-id>' `
#     -WorkingDirectory "D:\dev\github\crimetime"
#   $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew `
#     -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
#     -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DontStopOnIdleEnd
#   Register-ScheduledTask -TaskName "CTS Revoice" -Action $action -Settings $settings -Force
#   Start-ScheduledTask -TaskName "CTS Revoice"
#
# Check on it with the paragraph count, not with a process query. wmic has been seen
# reporting no matching processes while the render was running normally; use
# Get-CimInstance Win32_Process if you need to look at the processes themselves.
#
#   Get-ChildItem automation\studio\drafts\<id>\tts\p*.wav | Measure-Object
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

# CrimeTimeSnacks WEEKLY EPISODE (Mondays 08:00, scheduled). Drafts the next
# case from automation/cases.json, checks every claim against that episode's own
# research notes, voices it, renders the art and the Instagram kit, publishes and
# pushes, then messages Cory on Telegram.
#
# Publishing is automatic, and the gate is episode-verify.mjs, not a human tick:
# an episode goes out only if every claim on its list is carried by the notes.
# Anything held blocks the publish and the held claims are in the Telegram message
# and in the draft's fact-check.md. Add -NoPublish to build without publishing.
#
# Native commands run through cmd /c so Windows PowerShell 5.1 never sees their
# stderr (it would turn a harmless stderr line into a fatal error). See cts-content.ps1.
param([switch]$NoPublish)
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
Add-Content -Path $log -Value "$(Get-Date -Format o)  EPISODE START" -Encoding UTF8
$flag = if ($NoPublish) { "--no-publish" } else { "" }
cmd /c "node automation\episode-weekly.mjs $flag >> ""$log"" 2>&1"
if ($LASTEXITCODE -eq 0) {
    Add-Content -Path $log -Value "$(Get-Date -Format o)  EPISODE OK" -Encoding UTF8
} else {
    Add-Content -Path $log -Value "$(Get-Date -Format o)  EPISODE ERROR  node exited $LASTEXITCODE (read the lines above)" -Encoding UTF8
}

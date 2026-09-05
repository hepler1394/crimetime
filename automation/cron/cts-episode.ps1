# CrimeTimeSnacks WEEKLY EPISODE (Mondays 08:00, scheduled). Drafts the next
# case from automation/cases.json, voices it, renders the art and the Instagram
# kit, then messages Cory on Telegram that it is ready to review in the studio.
# It does not publish; that stays a click in the studio after the fact check.
# Add -AutoPublish to the task action to publish + push unattended.
#
# Native commands run through cmd /c so Windows PowerShell 5.1 never sees their
# stderr (it would turn a harmless stderr line into a fatal error). See cts-content.ps1.
param([switch]$AutoPublish)
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
Add-Content -Path $log -Value "$(Get-Date -Format o)  EPISODE START" -Encoding UTF8
$flag = if ($AutoPublish) { "--publish" } else { "" }
cmd /c "node automation\episode-weekly.mjs $flag >> ""$log"" 2>&1"
if ($LASTEXITCODE -eq 0) {
    Add-Content -Path $log -Value "$(Get-Date -Format o)  EPISODE OK" -Encoding UTF8
} else {
    Add-Content -Path $log -Value "$(Get-Date -Format o)  EPISODE ERROR  node exited $LASTEXITCODE (read the lines above)" -Encoding UTF8
}

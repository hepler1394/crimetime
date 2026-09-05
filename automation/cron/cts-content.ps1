# CrimeTimeSnacks CONTENT RUN (Tue + Fri, scheduled). The one button:
# refreshes podcast + YouTube + FBI live board, writes a blog post + merch
# design + quiz in Cory's voice, rebuilds the whole site, then commits + pushes
# (Vercel auto-deploys). Local LM Studio model first to save money; keys come
# from automation/config.json (gitignored) or env vars. Logs to cron.log.
#
# WHY cmd /c: the scheduled task runs Windows PowerShell 5.1. With
# $ErrorActionPreference = "Stop" and a `*>>` redirect, 5.1 turns the FIRST line
# any native command writes to stderr into a terminating error. git writes
# "From https://github.com/..." and "To https://github.com/..." to stderr even
# on success, so from 2026-08-28 to 2026-09-04 every content run died at
# `git pull` with that line as the "error". Letting cmd own the redirect keeps
# stderr away from PowerShell entirely; success is judged by the exit code.
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
Add-Content -Path $log -Value "$(Get-Date -Format o)  CONTENT START" -Encoding UTF8
cmd /c "node automation\weekly-update.mjs --commit --push >> ""$log"" 2>&1"
if ($LASTEXITCODE -eq 0) {
    Add-Content -Path $log -Value "$(Get-Date -Format o)  CONTENT OK" -Encoding UTF8
} else {
    Add-Content -Path $log -Value "$(Get-Date -Format o)  CONTENT ERROR  node exited $LASTEXITCODE (read the lines above)" -Encoding UTF8
}

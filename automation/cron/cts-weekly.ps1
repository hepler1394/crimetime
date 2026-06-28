# CrimeTimeSnacks WEEKLY auto-update (the one button, scheduled).
# Refreshes podcast + YouTube, writes a blog post, adds a merch design, rebuilds
# the whole site, then commits + pushes (Vercel auto-deploys). Uses the local LM
# Studio model first to save money; no API keys live in this script (they come
# from automation/config.json, gitignored, or env vars). Logs to cron.log.
$ErrorActionPreference = "Stop"
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
"$(Get-Date -Format o)  WEEKLY START" | Add-Content $log
try {
    & node "automation/weekly-update.mjs" --commit --push *>> $log
    "$(Get-Date -Format o)  WEEKLY OK" | Add-Content $log
} catch {
    "$(Get-Date -Format o)  WEEKLY ERROR  $($_.Exception.Message)" | Add-Content $log
}

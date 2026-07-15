# CrimeTimeSnacks CONTENT RUN (Tue + Fri, scheduled). The one button:
# refreshes podcast + YouTube + FBI live board, writes a blog post + merch
# design + quiz in Cory's voice, rebuilds the whole site, then commits + pushes
# (Vercel auto-deploys). Local LM Studio model first to save money; keys come
# from automation/config.json (gitignored) or env vars. Logs to cron.log.
$ErrorActionPreference = "Stop"
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
"$(Get-Date -Format o)  CONTENT START" | Add-Content $log
try {
    & node "automation/weekly-update.mjs" --commit --push *>> $log
    "$(Get-Date -Format o)  CONTENT OK" | Add-Content $log
} catch {
    "$(Get-Date -Format o)  CONTENT ERROR  $($_.Exception.Message)" | Add-Content $log
}

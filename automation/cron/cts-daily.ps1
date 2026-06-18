# Hermes cron job: generate one AI blog post (LOCAL LM Studio model first to save
# money, cloud fallback) and publish it. Logs to cron.log. Keys come from
# automation/config.json (gitignored) or env vars — never from this script.
$ErrorActionPreference = "Stop"
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
"$(Get-Date -Format o)  START" | Add-Content $log
try {
    & node "automation/ai-write.mjs" --auto --commit *>> $log
    & git push *>> $log
    "$(Get-Date -Format o)  OK" | Add-Content $log
} catch {
    "$(Get-Date -Format o)  ERROR  $($_.Exception.Message)" | Add-Content $log
}

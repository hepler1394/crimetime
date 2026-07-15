# CrimeTimeSnacks feed sync: keeps the site current between content runs.
# Pulls new podcast episodes + refreshes the FBI live board, rebuilds, and
# publishes ONLY if something changed (no empty commits). No API keys involved.
$ErrorActionPreference = "Stop"
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
"$(Get-Date -Format o)  FEEDSYNC START" | Add-Content $log
try {
    & node "automation/import-feed.mjs" *>> $log
    & node "automation/import-fbi.mjs"  *>> $log
    & node "automation/build-all.mjs"   *>> $log
    if (git status --porcelain) {
        & git add -A *>> $log
        & git commit -m "Sync: podcast feed + live case board" *>> $log
        & git push *>> $log
        "$(Get-Date -Format o)  FEEDSYNC PUBLISHED" | Add-Content $log
    } else {
        "$(Get-Date -Format o)  FEEDSYNC no changes" | Add-Content $log
    }
} catch {
    "$(Get-Date -Format o)  FEEDSYNC ERROR  $($_.Exception.Message)" | Add-Content $log
}

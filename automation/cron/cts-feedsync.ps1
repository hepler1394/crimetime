# CrimeTimeSnacks feed sync: keeps the site current between content runs.
# Pulls new podcast episodes + refreshes the FBI live board, rebuilds, and
# publishes ONLY if something changed (no empty commits). No API keys involved.
$ErrorActionPreference = "Stop"
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
"$(Get-Date -Format o)  FEEDSYNC START" | Add-Content $log
try {
    # Start from the latest published state. GitHub Actions pushes this same
    # sync every 6 hours; building on a stale tree regenerates the site from
    # old JSON and reverts its work, and the push below would be rejected.
    & git pull --rebase --autostash *>> $log
    if ($LASTEXITCODE -ne 0) { throw "git pull --rebase failed; tree is out of sync with origin" }

    & node "automation/import-feed.mjs" *>> $log
    & node "automation/import-fbi.mjs"  *>> $log
    & node "automation/build-all.mjs"   *>> $log
    if (git status --porcelain) {
        & git add -A *>> $log
        & git commit -m "Sync: podcast feed + live case board" *>> $log
        & git pull --rebase --autostash *>> $log
        if ($LASTEXITCODE -ne 0) { throw "git pull --rebase failed after commit; commit is safe locally" }
        & git push *>> $log
        if ($LASTEXITCODE -ne 0) { throw "git push rejected; commit is safe locally, run: git push" }
        "$(Get-Date -Format o)  FEEDSYNC PUBLISHED" | Add-Content $log
    } else {
        "$(Get-Date -Format o)  FEEDSYNC no changes" | Add-Content $log
    }
} catch {
    "$(Get-Date -Format o)  FEEDSYNC ERROR  $($_.Exception.Message)" | Add-Content $log
}

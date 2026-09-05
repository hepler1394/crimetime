# CrimeTimeSnacks feed sync: keeps the site current between content runs.
# Pulls new podcast episodes + refreshes the FBI live board, rebuilds, and
# publishes ONLY if something changed (no empty commits). No API keys involved.
#
# NOTE: GitHub Actions (.github/workflows/sync.yml) owns this job. The Windows
# task "CTS Feed Sync" is registered but DISABLED on purpose. See cron/README.md.
#
# Native commands run through cmd /c so Windows PowerShell 5.1 never sees their
# stderr (it would turn git's normal "From https://..." into a fatal error).
$repo = "D:\dev\github\crimetime"
$log  = Join-Path $repo "automation\cron\cron.log"
Set-Location $repo
function Log($msg) { Add-Content -Path $log -Value "$(Get-Date -Format o)  $msg" -Encoding UTF8 }
function Run($cmd) { cmd /c "$cmd >> ""$log"" 2>&1"; return $LASTEXITCODE }

Log "FEEDSYNC START"
if ((Run "git pull --rebase --autostash") -ne 0) { Log "FEEDSYNC ERROR  git pull --rebase failed; tree is out of sync with origin"; exit 1 }
Run "node automation\import-feed.mjs" | Out-Null
Run "node automation\import-fbi.mjs"  | Out-Null
if ((Run "node automation\build-all.mjs") -ne 0) { Log "FEEDSYNC ERROR  build-all failed"; exit 1 }
if (git status --porcelain) {
    Run "git add -A" | Out-Null
    Run "git commit -m ""Sync: podcast feed + live case board""" | Out-Null
    if ((Run "git pull --rebase --autostash") -ne 0) { Log "FEEDSYNC ERROR  rebase after commit failed; commit is safe locally"; exit 1 }
    if ((Run "git push") -ne 0) { Log "FEEDSYNC ERROR  git push rejected; commit is safe locally, run: git push"; exit 1 }
    Log "FEEDSYNC PUBLISHED"
} else {
    Log "FEEDSYNC no changes"
}

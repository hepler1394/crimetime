# Scheduled jobs — the site runs itself

Two rhythms keep CrimeTimeSnacks alive with zero hands on keyboard. **Each one
has exactly one owner.** Read the next section before adding or re-enabling a
schedule.

| Job | Owner | When | What it does |
|-----|-------|------|--------------|
| Content run | **This PC** — `cts-content.ps1` | Tue + Fri 09:00 | New blog post, merch design, quiz (all in Cory's voice), feed + YouTube + FBI refresh, rebuild, publish |
| Feed sync | **GitHub Actions** — `.github/workflows/sync.yml` | Every 6 hours | New podcast episodes + FBI live board, publish only if changed |
| Episode draft | **This PC** — `cts-episode.ps1` | Mon 08:00 | Next case from `cases.json`: script, voice, art, Instagram kit, then a Telegram note. Publish stays a click in the studio (see `../STUDIO.md`) |

## One owner per job — do not duplicate

From 2026-07-17 to 2026-08-26 both sides ran both jobs, and `main` split in two:
the cloud added 12 merch designs the PC never saw, the PC wrote 6 blog posts and
6 quizzes the cloud never saw, and every local push was rejected for six weeks
(48 straight failures in `cron.log`, silently swallowed by the `catch`).

Two things had to be true for that to happen, and both are now fixed:

1. **The generated files are not idempotent.** `build-all.mjs` rewrites every
   HTML page and stamps `meta.updated` on each run, so two schedulers building
   the same commit always produce conflicting diffs. An earlier version of this
   file claimed the two sides could coexist because "commits are idempotent."
   They are not.
2. **The local scripts pushed without pulling.** They now
   `git pull --rebase --autostash` before building *and* before pushing, and a
   rejected push is a loud failure instead of a swallowed one.

Ownership is split the way it is because only this PC can reach LM Studio. The
cloud workflow has no LLM key, so its AI blog/quiz steps are skipped — running
it on a schedule contributed nothing but duplicate merch drops. Conversely the
cloud sync needs no AI at all and runs 4x/day whether or not this PC is on, so
it is strictly better at that job.

`weekly.yml` is kept as **manual dispatch only** (Actions > Run workflow) for
when the PC is off for a while. `CTS Feed Sync` is registered but **disabled**
for the same reason, in reverse.

If you ever move a job to the other side, disable it on this side in the same
change — never leave both scheduled.

## 2026-09-05: why every content run since 2026-08-28 died

`cts-content.ps1` set `$ErrorActionPreference = "Stop"` and redirected node with
`*>> $log`. The task runs Windows PowerShell 5.1, which turns the FIRST line a
native command writes to stderr into a terminating error under those two
settings. `git pull` writes "From https://github.com/..." to stderr even on
success, so the moment the pull step was added (2026-08-26) every run died
there, and the log recorded that harmless line as the error. The 08-24/08-25
"To https://..." errors were the same thing on `git push`.

Both wrappers now hand the redirect to `cmd /c` so PowerShell never sees
stderr, and judge success by the exit code. The log is plain UTF-8 again (the
old `*>>` wrote UTF-16, which is why `cron.log` looked like `C o n t e n t`);
the garbled history is in `cron.log.old`.

## Register on Windows (per-user, no admin)

```
schtasks /create /tn "CTS Content Tue" /sc WEEKLY /d TUE /st 09:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-content.ps1"

schtasks /create /tn "CTS Content Fri" /sc WEEKLY /d FRI /st 09:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-content.ps1"

schtasks /create /tn "CTS Episode Draft" /sc WEEKLY /d MON /st 08:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-episode.ps1"
```

Do **not** register `CTS Feed Sync` — GitHub Actions owns that job. The task
still exists on this machine but is disabled; leave it that way unless you are
also turning off `.github/workflows/sync.yml`:

```
Get-ScheduledTask -TaskName "CTS Feed Sync" | Select-Object TaskName, State
```

Remove any old jobs first (if they exist):

```
schtasks /delete /tn "CTS Weekly Update" /f
schtasks /delete /tn "CTS Daily Post" /f
```

- Logs land in `automation/cron/cron.log`.
- Remove a job: `schtasks /delete /tn "CTS Content Tue" /f`
- Check for stranded commits: `git log --oneline origin/main..main`. This should
  be empty shortly after any content run. If it is not, a push failed — read the
  tail of `cron.log`.

Legacy scripts kept for reference: `cts-weekly.ps1`, `cts-daily.ps1` (superseded
by `cts-content.ps1`).

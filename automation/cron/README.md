# Scheduled jobs — the site runs itself

Two rhythms keep CrimeTimeSnacks alive with zero hands on keyboard:

| Job | When | What it does |
|-----|------|--------------|
| `cts-content.ps1` | **Tue + Fri 09:00** | Full content run: new blog post, merch design, quiz (all in Cory's voice), feed + YouTube + FBI refresh, rebuild, publish |
| `cts-feedsync.ps1` | **Daily 08:00** (or more often) | Light sync: new podcast episodes + FBI live board, publish only if changed |

## Register on Windows (per-user, no admin)

```
schtasks /create /tn "CTS Content Tue" /sc WEEKLY /d TUE /st 09:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-content.ps1"

schtasks /create /tn "CTS Content Fri" /sc WEEKLY /d FRI /st 09:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-content.ps1"

schtasks /create /tn "CTS Feed Sync" /sc DAILY /st 08:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-feedsync.ps1"
```

Remove any old jobs first (if they exist):

```
schtasks /delete /tn "CTS Weekly Update" /f
schtasks /delete /tn "CTS Daily Post" /f
```

- Logs land in `automation/cron/cron.log`.
- Remove a job: `schtasks /delete /tn "CTS Content Tue" /f`
- The GitHub Actions workflows (`.github/workflows/`) run the same pipeline in
  the cloud, so the site refreshes even when this PC is off. Both can coexist —
  commits are idempotent and empty runs don't publish.

Legacy scripts kept for reference: `cts-weekly.ps1`, `cts-daily.ps1` (superseded
by `cts-content.ps1`).

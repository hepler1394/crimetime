# Hermes cron jobs

Scheduled automation for CrimeTimeSnacks. Money-saving rule: **use the local
LM Studio model first**, fall back to cloud (Deepseek → Claude → OpenAI) only
when needed. No API keys live in any script — they come from
`automation/config.json` (gitignored) or environment variables.

## Setup (one time)

1. Copy `automation/config.example.json` → `automation/config.json` and fill in
   keys (or set env vars). `config.json` is gitignored.
2. To use the **free local model**: open LM Studio → load a model (e.g. Qwen3.6
   27B) → start the local server (Developer ▸ Start Server) on port 1234.
3. Test once: `node automation/ai-write.mjs --auto`

## Jobs

- **`cts-daily.ps1`** — generates one new blog post and publishes it (commit +
  push). Pair with the daily feed refresh below if you want episodes synced too.

## Schedule it (Windows Task Scheduler, per-user, no admin needed)

```
schtasks /create /tn "CTS Daily Post" /sc DAILY /st 09:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-daily.ps1"
```

Refresh episodes from the live podcast feed daily (optional):

```
schtasks /create /tn "CTS Feed Sync" /sc DAILY /st 08:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -Command "cd D:\dev\github\crimetime; node automation/import-feed.mjs; node automation/build-all.mjs; git commit -am 'Sync episodes from feed'; git push""
```

Remove a job: `schtasks /delete /tn "CTS Daily Post" /f`

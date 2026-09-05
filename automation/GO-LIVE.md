# Go live — full automation in 3 steps

Everything is built. To make the site auto-write and auto-publish, do this once.
Total time: ~10 minutes. **Never paste an API key into a chat** — keys go only
into `automation/config.json`, which is gitignored (never committed/pushed).

## Step 1 — give it a model (pick ONE; both is best)

**Free (local):** Open LM Studio → load a model (your Qwen3.6 27B) → top tab
**Developer ▸ Start Server** (port 1234). Done — generation is now free.

**Reliable (DeepSeek, cheap):** Open `automation/config.json`, paste your DeepSeek
key between the quotes on the `deepseek.apiKey` line, save. (If you don't have the
full key saved, create a new one at platform.deepseek.com → API keys.)

> Order is `local → deepseek → claude → openai`: it uses the free local model when
> LM Studio is running, and automatically falls back to DeepSeek when it isn't.

## Step 2 — verify (5 seconds)

```
cd D:\dev\github\crimetime
node automation/test-llm.mjs
```

You want: `✓ WORKING via local (LM Studio)` or `✓ WORKING via deepseek`.

Then a real end-to-end test (writes one post + publishes):

```
node automation/ai-write.mjs --auto --commit
git push
```

Check www.crimetimesnacks.com/blog — the new post should appear after Vercel deploys.

## Step 3 — schedule it (Windows Task Scheduler, no admin)

```
schtasks /create /tn "CTS Daily Post" /sc DAILY /st 09:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-daily.ps1"

schtasks /create /tn "CTS Feed Sync" /sc DAILY /st 08:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-feedsync.ps1"
```

Now: every morning a new post is written (local/DeepSeek) and published, and any
new podcast episode you release is pulled in and published automatically.

- Change `/sc DAILY` to `/sc WEEKLY` if daily posts are too many.
- Logs: `automation/cron/cron.log`.
- Remove a job: `schtasks /delete /tn "CTS Daily Post" /f`.

## Still on your list (separate from automation)
- **Revoke** the stolen Gemini + Brave keys (platform dashboards).
- Forms backend: paste a free web3forms.com key and all contact/newsletter forms
  work (see NEXT-STEPS.md).

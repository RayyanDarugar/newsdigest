# Industry Digest — n8n pipeline

`industry-digest-workflow.json` is the daily pipeline that feeds the app.
It scrapes reddit (via your Apify actor), world/business news (BBC RSS),
and market data (Yahoo Finance), has Claude synthesize the six-category
digest, and POSTs it to the app's `/api/ingest` endpoint. The exact JSON
shape it produces is `docs/ingest-contract.md` (in the repo root) — this
workflow is built to satisfy that contract.

## Import

1. In n8n: **Workflows → Import from File** → select `industry-digest-workflow.json`.
2. Read the four sticky notes on the canvas (Overview, Reddit via Apify,
   Tuning Sources, Credentials Setup) — they cover setup in more detail than
   this file.

## Required setup before activating

1. **Config node** — open it and set `appUrl` to your deployed app's URL
   (e.g. `https://your-app.vercel.app`). Also review the `industries`,
   `newsFeeds`, and `marketTickers` arrays; the `industries` slugs must match
   the `industries` table in Supabase exactly.
2. **Three credentials** (Credentials → New in n8n):
   - **Anthropic API Key** (Header Auth: `x-api-key` = your Anthropic key)
   - **Ingest Token** (Header Auth: `Authorization` = `Bearer <INGEST_TOKEN>`,
     the same value as `INGEST_TOKEN` in the app's `.env.local`)
   - **Apify API Token** (Query Auth: param name `token` = your Apify API
     token)
   Then open "Call Claude", "POST to Ingest", "Start Reddit Scrape", and
   "Fetch Reddit Dataset" and attach the matching credential to each —
   imports don't link credentials automatically, and no secret values are
   stored in the workflow JSON.
3. **Test run.** Click the manual execute button (▶) before turning on the
   schedule. Check each node's output as it runs, especially "Shape Reddit
   Items" (Apify field names can drift between actor versions) and "Call
   Claude" (confirm the response is a clean JSON array).
4. **Activate.** Once a manual run succeeds end-to-end (check the app to
   confirm the digest landed), toggle the workflow active. It's scheduled
   for 6:00 AM daily (cron `0 6 * * *` on the Schedule Trigger node) —
   change that expression if you want a different time.

## Notes

- Ingest is idempotent — re-running the workflow for the same day safely
  replaces that day's digest, so a failed run can just be re-triggered.
- If a run fails at "Call Claude" or "POST to Ingest", the raw items array
  computed earlier isn't lost — re-running from the top just re-scrapes,
  which is fine at this volume (nothing here is rate-limit-sensitive except
  possibly Reddit via Apify, which is metered by your Apify plan).
- The "Wait for Apify Run" step uses a fixed 3-minute delay. Check the Runs
  tab in the Apify console after a real run to see how long it actually
  takes with your subreddit list, and adjust if needed.

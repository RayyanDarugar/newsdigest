# Cron Digest Pipeline

Replaces the n8n workflow (`n8n/industry-digest-workflow.json`) with two routes
in this app. An external scheduler you control (not Vercel Cron, since this
runs on the Hobby plan's 60s function limit) drives both.

## Endpoints

```
POST {APP_URL}/api/cron/digest/start
POST {APP_URL}/api/cron/digest/finish
Authorization: Bearer {CRON_SECRET}
```

## Schedule

1. **Once a day** (e.g. 6:00 AM), call `/start`. It kicks off the Reddit
   scrape on Apify (`trudax~reddit-scraper-lite`) and returns `202` immediately
   — it does not wait for the scrape to finish.
2. **Every 1-2 minutes for the ~10 minutes after**, call `/finish`. Responses:
   - `{ "status": "pending" }` — Apify run isn't done yet, call again later.
   - `{ "status": "already_done" }` — today's digest is already written
     (safe to keep polling harmlessly, or stop).
   - `{ "status": "done", "date", "items", "entries" }` — digest written,
     stop polling.

## What each phase does

- `/start`: builds Reddit search URLs from `lib/digest/config.ts`'s
  `INDUSTRIES` list and POSTs them to Apify.
- `/finish`: checks Apify for a `SUCCEEDED` run; once found, fetches BBC RSS
  (world + business) and Yahoo Finance chart data for the configured tickers
  (both keyless), caps/renumbers everything (`lib/digest/assemble.ts`), asks
  Claude to synthesize the six-category digest (`lib/digest/synthesize.ts`),
  and writes it through the same `runIngest` path `/api/ingest` uses.

## Required env vars

- `APIFY_API_TOKEN` — Apify API token (Reddit scraping).
- `CRON_SECRET` — bearer token your poller sends; generate with
  `openssl rand -hex 32`.
- `ANTHROPIC_API_KEY` — already required for entry deep-dives/chat.

## Tuning

Reddit/news caps, subreddit list, news feeds, and market tickers all live in
`lib/digest/config.ts`. The synthesis prompt (category rules, industry
whitelist) lives in `lib/digest/prompt.ts`.

## Notes

`todayISO()` (used for the digest date) is UTC-based, so if the external
poller fires close to midnight in a timezone behind UTC, "today" may already
read as tomorrow in UTC. This is internally consistent — both the
idempotency check (`getDigestByDate`) and the written digest date use the
same value — but worth knowing when debugging date labeling.

## Manual ingest still works

`/api/ingest` (see `docs/ingest-contract.md`) is unchanged and still used by
`scripts/seed.ts` and for manual backfills — it's a normal HTTP POST with a
`date`/`entries`/`items` payload, independent of this cron pipeline.

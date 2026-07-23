# NewsDigest

A personal industry digest. The app itself fetches news/reddit/market data
once a day (`app/api/cron/digest/`, driven by an external scheduler — see
`docs/cron-pipeline.md`), has Claude synthesize it into a six-category home
feed, and stores it in Supabase alongside a per-industry drill-down of
everything scraped. (An earlier version of this pipeline ran in n8n —
`n8n/industry-digest-workflow.json` is kept for reference but is no longer
required.)

## Setup

1. Create a Supabase project, then open the SQL editor and run
   `supabase/schema.sql` to create the tables, the `replace_digest` function,
   and the seed rows (categories/industries).
2. `cp .env.example .env.local` and fill in the values:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — from Project Settings → API
   - `APP_PASSWORD` — shared password for the login page
   - `INGEST_TOKEN` — bearer token n8n uses to POST `/api/ingest` (`openssl rand -hex 32`)
   - `COOKIE_SECRET` — signs the session cookie (`openssl rand -hex 32`)
   - `APP_URL` — defaults to `http://localhost:3000`, used by `scripts/seed.ts`
3. `npm install`
4. `npm run dev`

## Seeding

`npm run seed` posts `docs/sample-payload.json` through the real ingest
endpoint so there's something to look at locally. Pass `-- --today` to seed
under today's date instead of the sample payload's own date.

## Testing

`npm test` runs the Vitest suite (schema validation, transform logic, etc.).

## Further reading

- `docs/cron-pipeline.md` — the two-phase cron pipeline that replaced the n8n
  workflow: what each route does, the polling schedule, required env vars.
- `docs/ingest-contract.md` — the payload shape n8n must send, validation
  rules, and response codes.
- `docs/superpowers/specs/` and `docs/superpowers/plans/` — the original
  design spec and implementation plan this app was built from.

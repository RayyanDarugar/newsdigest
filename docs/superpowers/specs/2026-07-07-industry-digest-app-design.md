# Personal Industry Intelligence App — Design

**Date:** 2026-07-07
**Status:** Approved by user (approach + both design sections)

## Purpose

A single-user web app that replaces an email digest as the destination for a daily,
n8n-generated industry intelligence report. The user browses today's synthesis on a
home feed, drills into any tracked industry to see everything scraped for it that day,
and revisits past days. The app is strictly read-only with respect to content: n8n
writes, the app displays. No scraping or LLM calls ever originate from the app.

**Important context:** the n8n workflow does not exist yet. This app defines the data
contract; the future n8n workflow will be built against it. Until then, a seed script
and sample payload make the app fully usable and testable.

## Constraints (from user)

- Read-only app; n8n is the only writer of content.
- No live scrape on click, ever. Industry drill-down reads only what the daily
  ingest already stored.
- Single user. Must not be wide open on the internet, but no real auth system —
  a shared password is sufficient. No multi-user, no admin UI.
- Hosting on Vercel.
- Industry list and category list will change over time — both must be data,
  not code.
- Future phase (not built now, must not be blocked): likes/saves on items,
  logging what the user is working on ("focus areas") so the pipeline can
  personalize what it surfaces.

## Architecture

- **Next.js** (App Router, TypeScript, Tailwind) deployed on **Vercel**.
- **Supabase Postgres** as the data layer. Chosen over Neon (no comparable
  data-browser UI — the Supabase table editor is the de-facto admin UI for
  hand-editing industries/categories) and over a file/Blob approach (would
  require a data-layer rebuild to add per-item interactions later).
- All content reads are **server-rendered** using the Supabase **service-role key,
  server-side only**. No client-side data fetching, no RLS.
- n8n (future) writes through a single **`POST /api/ingest`** endpoint on the app,
  authenticated with a bearer token. It does not write to the database directly;
  the app owns validation and normalization.

## Data model

Six tables. All ids are UUIDs unless noted.

### `industries`
| column | type | notes |
|---|---|---|
| `slug` | text, pk | e.g. `logistics` |
| `name` | text | display name |
| `active` | boolean | inactive industries hidden from nav, history retained |
| `sort_order` | int | nav ordering |

Hand-edited in the Supabase table editor. Seeded with the user's current ten:
sports management, media, manufacturing, consulting, contracting,
brick-and-mortar, energy, logistics, real estate, agriculture.

### `categories`
| column | type | notes |
|---|---|---|
| `slug` | text, pk | e.g. `big_event` |
| `name` | text | display name |
| `sort_order` | int | home-feed section ordering |

Seeded with the six: `big_event` (Biggest event/opportunity of the day),
`world_news`, `community_sentiment`, `industry_events`, `finance`,
`opportunities`. Data-driven so the structure can evolve by editing rows.

Notes on the six-category structure (validated during design):
- `big_event` is a single spotlight entry, not a list.
- `community_sentiment` entries are narrative-per-industry, each typically
  distilled from several reddit posts — hence the `entry_sources` join table.

### `digests`
| column | type | notes |
|---|---|---|
| `id` | uuid, pk | |
| `digest_date` | date, unique | one digest per day |
| `raw_payload` | jsonb | verbatim copy of the ingest POST body |
| `created_at` | timestamptz | |

`raw_payload` is deliberate future-proofing: history can be reprocessed later
without re-scraping.

### `source_items`
Everything scraped that day — the drill-down's data source.

| column | type | notes |
|---|---|---|
| `id` | uuid, pk | |
| `digest_id` | uuid, fk → digests | cascade delete |
| `industry_slug` | text, fk → industries, nullable | null for world news / market items |
| `source_type` | text | `reddit` \| `news` \| `market` |
| `title` | text | |
| `url` | text, nullable | link to original |
| `summary` | text, nullable | |
| `metadata` | jsonb | subreddit, score, comment count, tickers, etc. |
| `position` | int | rank within its group as scraped |

### `digest_entries`
The curated home-feed items.

| column | type | notes |
|---|---|---|
| `id` | uuid, pk | |
| `digest_id` | uuid, fk → digests | cascade delete |
| `category_slug` | text, fk → categories | |
| `industry_slug` | text, fk → industries, nullable | |
| `title` | text | |
| `body` | text | synthesized blurb |
| `position` | int | order within category section |

### `entry_sources`
| column | type | notes |
|---|---|---|
| `entry_id` | uuid, fk → digest_entries | composite pk |
| `source_item_id` | uuid, fk → source_items | composite pk |

Links each curated entry to all source items it was distilled from, so
"link back to the original source" means all of them.

### Future tables (documented, NOT built now)
- `interactions` — likes/saves keyed on `source_items.id` / `digest_entries.id`.
- `focus_areas` — free-text/tagged entries about what the user is currently
  working on; written by a future app UI, read by the n8n pipeline at
  scrape/synthesis time to personalize relevance. Additive; requires no change
  to the tables above.

## Ingestion contract

- **Endpoint:** `POST /api/ingest`
- **Auth:** `Authorization: Bearer <INGEST_TOKEN>` (env var; constant-time compare).
- **Body:** one JSON document per day:

```json
{
  "date": "2026-07-07",
  "entries": [
    {
      "category": "big_event",
      "industry": "energy",
      "title": "…",
      "body": "…",
      "position": 0,
      "source_refs": ["item-key-1", "item-key-2"]
    }
  ],
  "items": [
    {
      "key": "item-key-1",
      "industry": "energy",
      "source_type": "reddit",
      "title": "…",
      "url": "https://…",
      "summary": "…",
      "metadata": { "subreddit": "energy", "score": 412 },
      "position": 0
    }
  ]
}
```

- `items[].key` is a payload-local string id; `entries[].source_refs` reference
  those keys. The app maps keys → generated UUIDs and writes `entry_sources`.
- **Validation:** zod schema. Unknown category or industry slugs are rejected
  with a 422 listing the offending slugs (the user adds the slug in Supabase
  first, then re-runs — keeps slugs deliberate rather than auto-created).
- **Idempotent:** re-POSTing a date deletes and re-inserts that digest in a
  single transaction. Re-running the n8n workflow is always safe.
- Full request/response semantics documented in `docs/ingest-contract.md`
  with `docs/sample-payload.json` as the canonical example.

## App pages & behavior

### `/` — home feed
- Shows the **latest** digest (today's if landed, otherwise most recent, with a
  "Latest digest: <date>" note — never an empty page).
- Six category sections in `categories.sort_order`; `big_event` rendered as a
  spotlight at top, others as scannable lists ordered by `position`.
- Each entry: title, body, its linked source items (from `entry_sources`), and
  an industry chip linking to the drill-down for that entry's industry+date.
- Date navigation: previous/next day links + date picker; past days at
  `/d/[date]` (e.g. `/d/2026-07-05`). Days with no digest show "no digest for
  this date" with nav intact.

### `/industry/[slug]` — per-industry drill-down
- Accepts a `?date=` param (defaults to latest digest date).
- Shows all `source_items` for that industry+date, grouped by `source_type`,
  each linking out to the original; plus any `digest_entries` tagged with that
  industry that day.
- Pure DB read. Never triggers scraping.
- Nav lists all `active` industries.

### `/login` + middleware
- Single password field, compared against `APP_PASSWORD` env var.
- On success sets an HMAC-signed, HttpOnly cookie (~1-year expiry) —
  password typed roughly once per device.
- Next.js middleware redirects all unauthenticated routes (except `/login`,
  `/api/ingest`, static assets) to `/login`. `/api/ingest` uses bearer auth
  instead.
- `robots.txt` disallow-all + `noindex` meta. That is the entire access-control
  story, by design.

## Error handling

- Ingest: 401 bad/missing token; 422 schema or unknown-slug failures with
  actionable detail; 500s leave prior data intact (transactional replace).
- Reads: missing digest/industry → friendly empty states, never crashes.
- No client-side mutations exist, so no client error surface beyond the login
  form ("wrong password").

## Testing & verification

- Unit tests for the zod ingest schema and the key→UUID/`entry_sources`
  mapping logic.
- Seed script POSTs `docs/sample-payload.json` through the **real** `/api/ingest`
  endpoint (exercising the contract, not bypassing it).
- Manual verification: browse seeded app locally (home feed, drill-down, date
  nav, login) before deploying to Vercel.

## Deliverables

1. The Next.js app, deployed on Vercel, env vars set
   (`APP_PASSWORD`, `INGEST_TOKEN`, `COOKIE_SECRET`, Supabase URL + service-role key).
2. Supabase schema (SQL migration) + seeds for `industries` and `categories`.
3. `docs/ingest-contract.md` + `docs/sample-payload.json` — the spec the future
   n8n workflow is built against.
4. Seed script for local/prod sample data.

## Explicitly out of scope

- The n8n workflow itself (future; builds against the ingest contract).
- Likes/saves, focus-areas UI, any personalization logic.
- Real auth, multi-user, admin UI (Supabase table editor fills that role).
- Native/mobile apps; email sending.

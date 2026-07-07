# Ingest Contract

The daily pipeline (n8n) delivers one digest per day to the app with a single
HTTP request. The app owns validation; the pipeline just assembles this JSON.

## Endpoint

```
POST {APP_URL}/api/ingest
Authorization: Bearer {INGEST_TOKEN}
Content-Type: application/json
```

In n8n: an **HTTP Request** node, method POST, "Send Headers" with
`Authorization: Bearer <token>`, "Send Body" as JSON.

## Payload

One JSON document per day. Canonical example: `docs/sample-payload.json`.

```jsonc
{
  "date": "2026-07-07",          // YYYY-MM-DD; one digest per date
  "entries": [ ... ],             // curated home-feed items
  "items": [ ... ]                // EVERYTHING scraped that day
}
```

### `items[]` — everything scraped (feeds the per-industry drill-down)

| field | type | required | notes |
|---|---|---|---|
| `key` | string | yes | payload-local id, unique within this payload; referenced by `entries[].source_refs` |
| `industry` | string \| null | no | industry slug; null/omit for world news & market items |
| `source_type` | `"reddit"` \| `"news"` \| `"market"` | yes | |
| `title` | string | yes | |
| `url` | string \| null | no | link to the original post/article; must be an absolute URL (e.g. https://…) when present |
| `summary` | string \| null | no | |
| `metadata` | object | no | anything useful: `subreddit`, `score`, `comments`, `source`, `ticker`, `change_pct`… |
| `position` | int ≥ 0 | yes | rank within its group as scraped |

### `entries[]` — the curated six-category synthesis (home feed)

| field | type | required | notes |
|---|---|---|---|
| `category` | string | yes | category slug; must exist in the `categories` table |
| `industry` | string \| null | no | industry slug; must exist in `industries` table if present |
| `title` | string | yes | |
| `body` | string | yes | the synthesized blurb |
| `position` | int ≥ 0 | yes | order within the category section |
| `source_refs` | string[] | no (default `[]`) | `items[].key` values this entry was distilled from |

Current category slugs: `big_event` (single spotlight entry), `world_news`,
`community_sentiment`, `industry_events`, `finance`, `opportunities`.

## Rules

- **Idempotent:** re-POSTing the same `date` replaces that day's digest in a
  single transaction. Re-running the pipeline is always safe.
- **Unknown slugs are rejected**, never auto-created. If the payload uses a
  category or industry slug the database doesn't know, the whole request
  fails with 422 listing the offending slugs. Add the slug in the Supabase
  table editor, then re-run.
- **Dangling refs are rejected:** every `source_refs` value must match an
  `items[].key` in the same payload.
- **Duplicate `source_refs` within an entry are allowed and deduplicated:**
  `["k1","k1"]` is stored as a single `entry_sources` row.

## Responses

| status | meaning |
|---|---|
| 200 | `{ ok: true, date, items, entries }` — stored |
| 400 | body was not valid JSON |
| 401 | missing/wrong bearer token |
| 422 | schema violation (`issues`: zod detail) or unknown slugs (`unknown_industries`, `unknown_categories`) |
| 500 | database failure; previous data for that date is left intact |

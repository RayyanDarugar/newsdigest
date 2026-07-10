# Entry Detail Pages: Deep Dive, Business Angles & Chat

**Date:** 2026-07-09
**Status:** Approved pending spec review

## Overview

Every digest entry becomes clickable, opening a detail page (`/entry/[id]`) with three things:

1. **Deep dive** — a detailed AI-written analysis of the story, generated on first visit (streamed live), cached in Supabase forever after.
2. **Business angles** — personalized opportunity recommendations, driven by a short user-written profile bio.
3. **Chat bot** — an ephemeral conversation scoped to the entry, with the deep dive and the day's context preloaded.

Generation uses the Anthropic API directly from the app (Sonnet 5) with the built-in web search tool enabled, so deep dives and chat answers go beyond the thin stored summaries.

## Decisions made during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| When to generate deep dives | On first click, then cached | Only pays for entries actually opened; app needs an Anthropic key anyway for chat |
| Chat persistence | Ephemeral (React state only) | Daily-snapshot app; chats about old stories go stale. Persistence is a clean later add if missed |
| AI source material | Stored data + web search | Stored bodies are 2-4 sentences; web search makes deep dives more than re-phrasing |
| Business angles | Personalized via profile bio | Single editable text blob; big relevance gain |
| Clickable scope | Every digest entry | Consistent interaction; no dead-end cards |
| Page architecture | Instant page + streamed generation | Cold entries show known info immediately; analysis streams in over ~10-20s |
| Model | Sonnet 5 for deep dive and chat | Matches pipeline; volume is low enough that Haiku savings are pennies. One-line change later if desired |

## Data model

New migration (append to `supabase/schema.sql` conventions; run in Supabase SQL editor):

```sql
create table entry_deep_dives (
  entry_id uuid primary key references digest_entries(id) on delete cascade,
  summary text not null,              -- markdown analysis
  angles jsonb not null default '[]'::jsonb,  -- [{ title, rationale, first_move }]
  sources_used jsonb not null default '[]'::jsonb, -- [{ title, url }] cited by web search
  model text not null,
  created_at timestamptz not null default now()
);

create table app_profile (
  id int primary key default 1 check (id = 1),  -- single row
  bio text not null default '',
  updated_at timestamptz not null default now()
);
insert into app_profile (id) values (1);
```

Both tables get RLS enabled with no policies (service-role-only access), matching every existing table.

Cascade delete on `entry_id` means re-ingesting a day (which replaces entries with new UUIDs) automatically discards stale deep dives.

## Routes

| Route | Kind | Purpose |
|---|---|---|
| `/entry/[id]` | Page (server component) | Detail page. 404 on unknown ID. Behind existing login middleware |
| `POST /api/entries/[id]/deep-dive` | API, streaming | Generate deep dive; save on completion. Session-checked |
| `POST /api/entries/[id]/chat` | API, streaming | Stateless chat turn. Session-checked |
| `/settings` | Page + server action | Edit profile bio. Linked from masthead |

Both API routes verify the session cookie themselves (the middleware guards pages; API routes need their own check, as `/api/ingest` demonstrates with its bearer token).

## Deep dive generation flow

**Detail page render:**
- Server component fetches entry + sources + deep-dive row + that day's other entries in one pass.
- Cached: deep dive + angles render as static server-rendered content.
- Uncached: page renders header (category, industry tag, title, original body, source links, date, back-link) immediately; a client component calls the generate endpoint and renders the stream.

**Generate endpoint:**
1. Session check.
2. Return cached row if one exists (guards double-generation).
3. Build prompt from: the entry, its source items, the same day's other entries (broader context), and the profile bio.
4. Call Sonnet 5 with web search enabled, capped at 3 searches.
5. Request structured output: markdown summary + JSON angles block + cited sources. Stream text to the client.
6. On completion, parse and upsert `entry_deep_dives`. If the angles JSON is malformed, save the summary and fall back to rendering angles from raw text — never fail the whole generation over formatting (same defensive philosophy as the n8n payload node).

**Regeneration:** a "regenerate" button on the detail page deletes the cached row and re-runs. This is the only cache-invalidation control; useful after profile edits or story developments.

**Cost:** ~a few cents per generation (Sonnet 5 tokens + up to 3 searches at ~1¢ each), paid once per opened entry.

## Chat

**Client:** messages held in React state; streams assistant replies token by token. Disabled with a hint until the deep dive exists (chat context depends on it). Lost on refresh by design.

**Server (`POST /api/entries/[id]/chat`):**
1. Session check.
2. Body: full visible message history (server stores nothing).
3. System prompt assembled per call: entry + sources + day's other entries + cached deep dive + profile bio.
4. Sonnet 5 with web search (cap ~3 searches per message); response streams back.

**Guardrails:** history truncated to the last 20 messages before sending to the API; `max_tokens` bounded for conversational-length replies.

## UI

- **Entry cards** (all three variants in `components/entry-card.tsx`: spotlight, feature, regular) link to `/entry/[id]` with a visible hover affordance, consistent with the existing hover-lift style. Nested links (industry tag, source links) keep their own navigation.
- **Detail page layout**, matching the editorial "exchange floor" aesthetic:
  1. Header: category label, industry tag, title, original body, source links, date + back-link to `/d/[date]`
  2. "The Deep Dive" — markdown analysis
  3. "Angles" — angle cards (title / why it fits you / first move)
  4. Sources consulted — footnote list of web-search citations
  5. Chat panel
- **Settings page:** one textarea for the bio, save via server action (same pattern as login). Empty bio → prompts fall back to generic angles.

## Error handling

- Unknown entry ID → 404.
- Generation fails midstream → error state with retry; the row is only written on successful completion, so nothing is half-saved.
- Chat turn fails → error bubble with retry; local history untouched.
- Missing `ANTHROPIC_API_KEY` → clear 500 naming the missing var, matching existing route conventions.

## Configuration

- New env var: `ANTHROPIC_API_KEY` in `.env.local` and Vercel (the same key n8n uses works).

## Testing

Mirrors the existing vitest setup; all mocked, no live API calls:

- Prompt assembly: entry + sources + profile → expected prompt shape.
- Response parsing: structured output → summary/angles/sources, including the malformed-angles fallback.
- Route auth: both new API routes reject missing/invalid session tokens.
- Existing suite untouched.

Live verification (real Anthropic calls, streaming in the browser) is run manually by Rayyan against a checklist provided at the end of implementation.

## Out of scope

- Chat persistence (explicitly deferred; message format makes it an incremental add)
- Detail pages for raw source items on industry pages
- Pre-generation in the n8n pipeline
- Multi-user profiles (single-row profile matches the single-user app)

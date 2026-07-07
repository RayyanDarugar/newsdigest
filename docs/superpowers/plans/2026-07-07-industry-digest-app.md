# Industry Digest App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-user, password-gated Next.js app on Vercel that displays a daily industry digest ingested from a future n8n pipeline via `POST /api/ingest`, backed by Supabase Postgres.

**Architecture:** Server-rendered Next.js App Router app. All reads go through `lib/queries.ts` using the Supabase service-role key (server-only, no RLS policies, RLS enabled to lock out anon access). Writes happen only through `/api/ingest` (bearer token), which validates with zod, maps payload keys to UUIDs in pure TypeScript, and calls a single Postgres function `replace_digest` for transactional delete-and-replace. Auth is a shared password → HMAC-signed cookie checked by middleware.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind), Supabase Postgres via `@supabase/supabase-js`, zod, Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-07-07-industry-digest-app-design.md`

## Global Constraints

- Read-only app: no scraping, no LLM calls, no content writes except `/api/ingest`.
- All data reads server-side with `SUPABASE_SERVICE_ROLE_KEY`; never expose it to the client; no `NEXT_PUBLIC_` Supabase vars.
- Env vars (exact names): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_PASSWORD`, `INGEST_TOKEN`, `COOKIE_SECRET`, optional `APP_URL`.
- Session cookie name: `digest_session`, HttpOnly, 365-day expiry.
- Source types (exact): `reddit`, `news`, `market`.
- Category slugs (exact): `big_event`, `world_news`, `community_sentiment`, `industry_events`, `finance`, `opportunities`.
- Industry slugs (exact seeds): `sports-management`, `media`, `manufacturing`, `consulting`, `contracting`, `brick-and-mortar`, `energy`, `logistics`, `real-estate`, `agriculture`.
- Unknown category/industry slugs in an ingest payload → 422 listing offending slugs. Never auto-create slugs.
- Digest pages use `export const dynamic = "force-dynamic";` (data changes daily; never serve stale cache).
- Use npm. Node 20+.
- `lib/auth.ts` must use only Web Crypto (`crypto.subtle`) — it runs in Edge middleware.

---

### Task 1: Scaffold Next.js project with Vitest

**Files:**
- Create: entire Next.js scaffold in repo root (create-next-app)
- Create: `vitest.config.ts`
- Create: `.env.example`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: working Next.js app skeleton; `npm test` runs Vitest; `@/*` import alias resolves in both Next and Vitest.

- [ ] **Step 1: Scaffold the app**

The repo root contains only `docs/` and `.git`, both of which create-next-app tolerates. Run from the repo root:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --turbopack --use-npm
```

If it prompts for anything not covered by flags, accept the default.

- [ ] **Step 2: Install dependencies**

```bash
npm install zod @supabase/supabase-js
npm install -D vitest tsx
```

- [ ] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 4: Add scripts and env example**

In `package.json`, add to `"scripts"` (keep the existing `dev`/`build`/`start`/`lint` entries):

```json
"test": "vitest run",
"test:watch": "vitest",
"seed": "node --env-file=.env.local --import tsx scripts/seed.ts"
```

Create `.env.example`:

```bash
# Supabase (Project Settings → API)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Shared password for the login page
APP_PASSWORD=

# Bearer token the n8n pipeline uses to POST /api/ingest (generate: openssl rand -hex 32)
INGEST_TOKEN=

# Secret for signing the session cookie (generate: openssl rand -hex 32)
COOKIE_SECRET=

# Base URL used by scripts/seed.ts (defaults to http://localhost:3000)
APP_URL=http://localhost:3000
```

Confirm `.gitignore` contains `.env*` entries that ignore `.env.local` (create-next-app's default does). Ensure `.env.example` is NOT ignored — if the scaffold's `.gitignore` has a blanket `.env*` line, add `!.env.example` below it.

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: build completes without errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, Vitest, zod, supabase-js"
```

---

### Task 2: Supabase schema, seeds, and replace_digest function — USER CHECKPOINT

**Files:**
- Create: `supabase/schema.sql`
- Create: `.env.local` (NOT committed — user fills values)

**Interfaces:**
- Consumes: nothing
- Produces: live Supabase database with tables `industries`, `categories`, `digests`, `source_items`, `digest_entries`, `entry_sources`; Postgres function `replace_digest(p_digest jsonb, p_items jsonb, p_entries jsonb, p_entry_sources jsonb)`; seeded industries and categories. Column names and types below are relied on by every later task.

- [ ] **Step 1: Write the schema file**

Create `supabase/schema.sql`:

```sql
-- Industry Digest schema. Run in the Supabase SQL editor.
-- Idempotent-ish: drops nothing; run once on a fresh project.

create table industries (
  slug text primary key,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0
);

create table categories (
  slug text primary key,
  name text not null,
  sort_order int not null default 0
);

create table digests (
  id uuid primary key,
  digest_date date not null unique,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create table source_items (
  id uuid primary key,
  digest_id uuid not null references digests(id) on delete cascade,
  industry_slug text references industries(slug),
  source_type text not null check (source_type in ('reddit', 'news', 'market')),
  title text not null,
  url text,
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  position int not null default 0
);

create index source_items_digest_industry_idx on source_items (digest_id, industry_slug);

create table digest_entries (
  id uuid primary key,
  digest_id uuid not null references digests(id) on delete cascade,
  category_slug text not null references categories(slug),
  industry_slug text references industries(slug),
  title text not null,
  body text not null,
  position int not null default 0
);

create index digest_entries_digest_category_idx on digest_entries (digest_id, category_slug);

create table entry_sources (
  entry_id uuid not null references digest_entries(id) on delete cascade,
  source_item_id uuid not null references source_items(id) on delete cascade,
  primary key (entry_id, source_item_id)
);

-- The app uses only the service-role key. Enable RLS with no policies so the
-- anon key can read nothing.
alter table industries enable row level security;
alter table categories enable row level security;
alter table digests enable row level security;
alter table source_items enable row level security;
alter table digest_entries enable row level security;
alter table entry_sources enable row level security;

-- Transactional delete-and-replace for one day's digest. Functions run in a
-- single transaction, so a failure leaves prior data intact.
create or replace function replace_digest(
  p_digest jsonb,
  p_items jsonb,
  p_entries jsonb,
  p_entry_sources jsonb
) returns void
language plpgsql
as $$
begin
  delete from digests where digest_date = (p_digest ->> 'digest_date')::date;

  insert into digests (id, digest_date, raw_payload)
  values (
    (p_digest ->> 'id')::uuid,
    (p_digest ->> 'digest_date')::date,
    p_digest -> 'raw_payload'
  );

  insert into source_items (id, digest_id, industry_slug, source_type, title, url, summary, metadata, position)
  select
    (x ->> 'id')::uuid,
    (x ->> 'digest_id')::uuid,
    x ->> 'industry_slug',
    x ->> 'source_type',
    x ->> 'title',
    x ->> 'url',
    x ->> 'summary',
    coalesce(x -> 'metadata', '{}'::jsonb),
    (x ->> 'position')::int
  from jsonb_array_elements(p_items) x;

  insert into digest_entries (id, digest_id, category_slug, industry_slug, title, body, position)
  select
    (x ->> 'id')::uuid,
    (x ->> 'digest_id')::uuid,
    x ->> 'category_slug',
    x ->> 'industry_slug',
    x ->> 'title',
    x ->> 'body',
    (x ->> 'position')::int
  from jsonb_array_elements(p_entries) x;

  insert into entry_sources (entry_id, source_item_id)
  select
    (x ->> 'entry_id')::uuid,
    (x ->> 'source_item_id')::uuid
  from jsonb_array_elements(p_entry_sources) x;
end;
$$;

-- Seeds
insert into categories (slug, name, sort_order) values
  ('big_event', 'Biggest Event of the Day', 0),
  ('world_news', 'World News', 1),
  ('community_sentiment', 'Community Sentiment', 2),
  ('industry_events', 'Industry Events', 3),
  ('finance', 'Finance', 4),
  ('opportunities', 'Opportunities', 5);

insert into industries (slug, name, sort_order) values
  ('sports-management', 'Sports Management', 0),
  ('media', 'Media', 1),
  ('manufacturing', 'Manufacturing', 2),
  ('consulting', 'Consulting', 3),
  ('contracting', 'Contracting', 4),
  ('brick-and-mortar', 'Brick & Mortar', 5),
  ('energy', 'Energy', 6),
  ('logistics', 'Logistics', 7),
  ('real-estate', 'Real Estate', 8),
  ('agriculture', 'Agriculture', 9);
```

- [ ] **Step 2: USER CHECKPOINT — create the Supabase project and apply the schema**

Pause and ask the user to:
1. Create a free Supabase project at https://supabase.com/dashboard (any name, e.g. `industry-digest`).
2. Open SQL Editor → paste the full contents of `supabase/schema.sql` → Run.
3. Copy from Project Settings → API: the project URL and the `service_role` key.
4. Provide those two values (or paste them into `.env.local` themselves).

Then create `.env.local` from `.env.example` with real values, generating secrets:

```bash
cp .env.example .env.local
openssl rand -hex 32   # → INGEST_TOKEN
openssl rand -hex 32   # → COOKIE_SECRET
```

Set `APP_PASSWORD` to whatever the user wants (ask them).

- [ ] **Step 3: Verify schema applied**

```bash
curl -s "$SUPABASE_URL/rest/v1/categories?select=slug&order=sort_order" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

(Substitute env values from `.env.local`.) Expected: JSON array of the six category slugs starting with `big_event`.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema, replace_digest function, and seeds"
```

---

### Task 3: Auth library (HMAC session tokens)

**Files:**
- Create: `lib/auth.ts`
- Test: `lib/auth.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `createSessionToken(secret: string, now?: number): Promise<string>` — token valid 365 days from `now` (default `Date.now()`).
  - `verifySessionToken(token: string | undefined, secret: string, now?: number): Promise<boolean>`
  - `safeEqual(a: string, b: string): boolean` — constant-time string compare (used by login action and ingest route).
  - Edge-safe: Web Crypto only, no `node:` imports.

- [ ] **Step 1: Write the failing tests**

Create `lib/auth.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken, safeEqual } from "@/lib/auth";

const SECRET = "test-secret";

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken("other-secret");
    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });

  it("rejects a tampered expiry", async () => {
    const token = await createSessionToken(SECRET);
    const [exp, sig] = token.split(".");
    expect(await verifySessionToken(`${Number(exp) + 1}.${sig}`, SECRET)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const past = Date.now() - 400 * 24 * 60 * 60 * 1000; // 400 days ago
    const token = await createSessionToken(SECRET, past);
    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });

  it("rejects undefined and malformed tokens", async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
    expect(await verifySessionToken("", SECRET)).toBe(false);
    expect(await verifySessionToken("garbage", SECRET)).toBe(false);
    expect(await verifySessionToken("123.", SECRET)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("matches equal strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });
  it("rejects different strings and different lengths", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — cannot resolve `@/lib/auth`.

- [ ] **Step 3: Implement lib/auth.ts**

```ts
// Edge-safe session tokens: Web Crypto only (this module runs in middleware).

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const encoder = new TextEncoder();

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(
  secret: string,
  now: number = Date.now(),
): Promise<string> {
  const exp = now + YEAR_MS;
  return `${exp}.${await hmacHex(secret, String(exp))}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!sig || !/^\d+$/.test(expStr)) return false;
  const expected = await hmacHex(secret, expStr);
  if (!safeEqual(sig, expected)) return false;
  return Number(expStr) > now;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts lib/auth.test.ts
git commit -m "feat: add HMAC session token library (edge-safe)"
```

---

### Task 4: Ingest payload schema (zod)

**Files:**
- Create: `lib/ingest/schema.ts`
- Test: `lib/ingest/schema.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `ingestPayloadSchema` — zod schema for the full POST body.
  - `type IngestPayload = z.infer<typeof ingestPayloadSchema>` with shape `{ date: string; entries: IngestEntry[]; items: IngestItem[] }` where `IngestItem = { key: string; industry?: string | null; source_type: "reddit" | "news" | "market"; title: string; url?: string | null; summary?: string | null; metadata?: Record<string, unknown>; position: number }` and `IngestEntry = { category: string; industry?: string | null; title: string; body: string; position: number; source_refs: string[] }`.
  - Schema-level rules: `date` matches `YYYY-MM-DD`; duplicate `items[].key` rejected; any `source_refs` value not present among item keys rejected.

- [ ] **Step 1: Write the failing tests**

Create `lib/ingest/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ingestPayloadSchema } from "@/lib/ingest/schema";

function validPayload() {
  return {
    date: "2026-07-07",
    entries: [
      {
        category: "big_event",
        industry: "energy",
        title: "Big storage news",
        body: "A synthesized blurb.",
        position: 0,
        source_refs: ["item-1"],
      },
    ],
    items: [
      {
        key: "item-1",
        industry: "energy",
        source_type: "reddit",
        title: "Texas battery storage hit 12GW",
        url: "https://reddit.com/r/energy/abc",
        summary: "A post about storage.",
        metadata: { subreddit: "energy", score: 288 },
        position: 0,
      },
    ],
  };
}

describe("ingestPayloadSchema", () => {
  it("accepts a valid payload", () => {
    expect(ingestPayloadSchema.safeParse(validPayload()).success).toBe(true);
  });

  it("accepts null industry and missing optional fields", () => {
    const p = validPayload();
    p.items.push({
      key: "item-2",
      industry: null,
      source_type: "market",
      title: "WTI +2.3%",
      url: null,
      summary: null,
      metadata: {},
      position: 1,
    });
    expect(ingestPayloadSchema.safeParse(p).success).toBe(true);
  });

  it("rejects a bad date format", () => {
    const p = validPayload();
    p.date = "07/07/2026";
    expect(ingestPayloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects an unknown source_type", () => {
    const p = validPayload();
    p.items[0].source_type = "tiktok";
    expect(ingestPayloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects duplicate item keys", () => {
    const p = validPayload();
    p.items.push({ ...p.items[0] });
    expect(ingestPayloadSchema.safeParse(p).success).toBe(false);
  });

  it("rejects source_refs pointing at a nonexistent item key", () => {
    const p = validPayload();
    p.entries[0].source_refs = ["no-such-item"];
    expect(ingestPayloadSchema.safeParse(p).success).toBe(false);
  });

  it("defaults source_refs to empty array", () => {
    const p = validPayload();
    delete (p.entries[0] as Record<string, unknown>).source_refs;
    const parsed = ingestPayloadSchema.safeParse(p);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.entries[0].source_refs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — cannot resolve `@/lib/ingest/schema`.

- [ ] **Step 3: Implement lib/ingest/schema.ts**

```ts
import { z } from "zod";

export const ingestItemSchema = z.object({
  key: z.string().min(1),
  industry: z.string().min(1).nullish(),
  source_type: z.enum(["reddit", "news", "market"]),
  title: z.string().min(1),
  url: z.string().url().nullish(),
  summary: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  position: z.number().int().min(0),
});

export const ingestEntrySchema = z.object({
  category: z.string().min(1),
  industry: z.string().min(1).nullish(),
  title: z.string().min(1),
  body: z.string().min(1),
  position: z.number().int().min(0),
  source_refs: z.array(z.string().min(1)).default([]),
});

export const ingestPayloadSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    entries: z.array(ingestEntrySchema),
    items: z.array(ingestItemSchema),
  })
  .superRefine((payload, ctx) => {
    const keys = new Set<string>();
    payload.items.forEach((item, i) => {
      if (keys.has(item.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["items", i, "key"],
          message: `duplicate item key: ${item.key}`,
        });
      }
      keys.add(item.key);
    });
    payload.entries.forEach((entry, i) => {
      entry.source_refs.forEach((ref, j) => {
        if (!keys.has(ref)) {
          ctx.addIssue({
            code: "custom",
            path: ["entries", i, "source_refs", j],
            message: `source_ref does not match any item key: ${ref}`,
          });
        }
      });
    });
  });

export type IngestItem = z.infer<typeof ingestItemSchema>;
export type IngestEntry = z.infer<typeof ingestEntrySchema>;
export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
```

Note: if the installed zod is v3 and `code: "custom"` fails type-checking, use `code: z.ZodIssueCode.custom` instead.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/schema.ts lib/ingest/schema.test.ts
git commit -m "feat: add zod schema for ingest payload"
```

---

### Task 5: Slug validation and payload transform

**Files:**
- Create: `lib/ingest/validate-slugs.ts`
- Create: `lib/ingest/transform.ts`
- Test: `lib/ingest/validate-slugs.test.ts`
- Test: `lib/ingest/transform.test.ts`

**Interfaces:**
- Consumes: `IngestPayload` from `@/lib/ingest/schema` (Task 4).
- Produces:
  - `validateSlugs(payload: IngestPayload, knownIndustries: Set<string>, knownCategories: Set<string>): { unknownIndustries: string[]; unknownCategories: string[] }` — deduplicated, sorted.
  - `transformPayload(payload: IngestPayload): TransformResult` where

    ```ts
    type TransformResult = {
      digest: { id: string; digest_date: string; raw_payload: IngestPayload };
      items: Array<{ id: string; digest_id: string; industry_slug: string | null; source_type: string; title: string; url: string | null; summary: string | null; metadata: Record<string, unknown>; position: number }>;
      entries: Array<{ id: string; digest_id: string; category_slug: string; industry_slug: string | null; title: string; body: string; position: number }>;
      entrySources: Array<{ entry_id: string; source_item_id: string }>;
    };
    ```
  - These four row arrays map 1:1 onto the `replace_digest` function parameters (Task 2).

- [ ] **Step 1: Write the failing tests**

Create `lib/ingest/validate-slugs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateSlugs } from "@/lib/ingest/validate-slugs";
import type { IngestPayload } from "@/lib/ingest/schema";

const INDUSTRIES = new Set(["energy", "logistics"]);
const CATEGORIES = new Set(["big_event", "world_news"]);

function payload(overrides: Partial<IngestPayload> = {}): IngestPayload {
  return {
    date: "2026-07-07",
    entries: [
      { category: "big_event", industry: "energy", title: "t", body: "b", position: 0, source_refs: [] },
    ],
    items: [
      { key: "k1", industry: "logistics", source_type: "reddit", title: "t", position: 0 },
    ],
    ...overrides,
  };
}

describe("validateSlugs", () => {
  it("passes when all slugs are known", () => {
    expect(validateSlugs(payload(), INDUSTRIES, CATEGORIES)).toEqual({
      unknownIndustries: [],
      unknownCategories: [],
    });
  });

  it("ignores null/absent industries", () => {
    const p = payload({
      entries: [{ category: "big_event", industry: null, title: "t", body: "b", position: 0, source_refs: [] }],
      items: [{ key: "k1", source_type: "market", title: "t", position: 0 }],
    });
    expect(validateSlugs(p, INDUSTRIES, CATEGORIES)).toEqual({
      unknownIndustries: [],
      unknownCategories: [],
    });
  });

  it("reports unknown slugs from both entries and items, deduplicated and sorted", () => {
    const p = payload({
      entries: [
        { category: "mystery_cat", industry: "aerospace", title: "t", body: "b", position: 0, source_refs: [] },
        { category: "mystery_cat", industry: "biotech", title: "t", body: "b", position: 1, source_refs: [] },
      ],
      items: [{ key: "k1", industry: "aerospace", source_type: "news", title: "t", position: 0 }],
    });
    expect(validateSlugs(p, INDUSTRIES, CATEGORIES)).toEqual({
      unknownIndustries: ["aerospace", "biotech"],
      unknownCategories: ["mystery_cat"],
    });
  });
});
```

Create `lib/ingest/transform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { transformPayload } from "@/lib/ingest/transform";
import type { IngestPayload } from "@/lib/ingest/schema";

const PAYLOAD: IngestPayload = {
  date: "2026-07-07",
  entries: [
    { category: "big_event", industry: "energy", title: "Entry A", body: "b", position: 0, source_refs: ["k1", "k2"] },
    { category: "world_news", industry: null, title: "Entry B", body: "b", position: 0, source_refs: [] },
  ],
  items: [
    { key: "k1", industry: "energy", source_type: "reddit", title: "Item 1", metadata: { score: 5 }, position: 0 },
    { key: "k2", industry: null, source_type: "news", title: "Item 2", url: "https://example.com", position: 1 },
  ],
};

describe("transformPayload", () => {
  it("produces a digest row with the payload date and raw payload", () => {
    const t = transformPayload(PAYLOAD);
    expect(t.digest.digest_date).toBe("2026-07-07");
    expect(t.digest.raw_payload).toEqual(PAYLOAD);
    expect(t.digest.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("assigns every row the digest id", () => {
    const t = transformPayload(PAYLOAD);
    expect(t.items.every((i) => i.digest_id === t.digest.id)).toBe(true);
    expect(t.entries.every((e) => e.digest_id === t.digest.id)).toBe(true);
  });

  it("maps source_refs to entry_sources rows via generated item ids", () => {
    const t = transformPayload(PAYLOAD);
    const entryA = t.entries.find((e) => e.title === "Entry A")!;
    const item1 = t.items.find((i) => i.title === "Item 1")!;
    const item2 = t.items.find((i) => i.title === "Item 2")!;
    expect(t.entrySources).toEqual([
      { entry_id: entryA.id, source_item_id: item1.id },
      { entry_id: entryA.id, source_item_id: item2.id },
    ]);
  });

  it("normalizes optional fields to null / empty object", () => {
    const t = transformPayload(PAYLOAD);
    const item1 = t.items.find((i) => i.title === "Item 1")!;
    expect(item1.url).toBeNull();
    expect(item1.summary).toBeNull();
    const item2 = t.items.find((i) => i.title === "Item 2")!;
    expect(item2.metadata).toEqual({});
    expect(item2.industry_slug).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — cannot resolve the two new modules.

- [ ] **Step 3: Implement lib/ingest/validate-slugs.ts**

```ts
import type { IngestPayload } from "@/lib/ingest/schema";

export function validateSlugs(
  payload: IngestPayload,
  knownIndustries: Set<string>,
  knownCategories: Set<string>,
): { unknownIndustries: string[]; unknownCategories: string[] } {
  const unknownIndustries = new Set<string>();
  const unknownCategories = new Set<string>();

  for (const item of payload.items) {
    if (item.industry && !knownIndustries.has(item.industry)) {
      unknownIndustries.add(item.industry);
    }
  }
  for (const entry of payload.entries) {
    if (entry.industry && !knownIndustries.has(entry.industry)) {
      unknownIndustries.add(entry.industry);
    }
    if (!knownCategories.has(entry.category)) {
      unknownCategories.add(entry.category);
    }
  }

  return {
    unknownIndustries: [...unknownIndustries].sort(),
    unknownCategories: [...unknownCategories].sort(),
  };
}
```

- [ ] **Step 4: Implement lib/ingest/transform.ts**

```ts
import type { IngestPayload } from "@/lib/ingest/schema";

export type TransformResult = {
  digest: { id: string; digest_date: string; raw_payload: IngestPayload };
  items: Array<{
    id: string;
    digest_id: string;
    industry_slug: string | null;
    source_type: string;
    title: string;
    url: string | null;
    summary: string | null;
    metadata: Record<string, unknown>;
    position: number;
  }>;
  entries: Array<{
    id: string;
    digest_id: string;
    category_slug: string;
    industry_slug: string | null;
    title: string;
    body: string;
    position: number;
  }>;
  entrySources: Array<{ entry_id: string; source_item_id: string }>;
};

export function transformPayload(payload: IngestPayload): TransformResult {
  const digestId = crypto.randomUUID();
  const keyToId = new Map<string, string>();

  const items = payload.items.map((item) => {
    const id = crypto.randomUUID();
    keyToId.set(item.key, id);
    return {
      id,
      digest_id: digestId,
      industry_slug: item.industry ?? null,
      source_type: item.source_type,
      title: item.title,
      url: item.url ?? null,
      summary: item.summary ?? null,
      metadata: item.metadata ?? {},
      position: item.position,
    };
  });

  const entries: TransformResult["entries"] = [];
  const entrySources: TransformResult["entrySources"] = [];

  for (const entry of payload.entries) {
    const id = crypto.randomUUID();
    entries.push({
      id,
      digest_id: digestId,
      category_slug: entry.category,
      industry_slug: entry.industry ?? null,
      title: entry.title,
      body: entry.body,
      position: entry.position,
    });
    for (const ref of entry.source_refs) {
      // Schema guarantees every ref resolves (superRefine in Task 4).
      entrySources.push({ entry_id: id, source_item_id: keyToId.get(ref)! });
    }
  }

  return {
    digest: { id: digestId, digest_date: payload.date, raw_payload: payload },
    items,
    entries,
    entrySources,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/ingest/validate-slugs.ts lib/ingest/validate-slugs.test.ts lib/ingest/transform.ts lib/ingest/transform.test.ts
git commit -m "feat: add slug validation and payload-to-rows transform"
```

---

### Task 6: Supabase client and ingest route

**Files:**
- Create: `lib/db.ts`
- Create: `app/api/ingest/route.ts`

**Interfaces:**
- Consumes: `ingestPayloadSchema` (Task 4), `validateSlugs`, `transformPayload` (Task 5), `safeEqual` (Task 3), `replace_digest` DB function (Task 2).
- Produces:
  - `getServiceClient(): SupabaseClient` from `@/lib/db` — memoized service-role client, used by all later query code.
  - `POST /api/ingest` — 401 (bad token), 400 (non-JSON body), 422 (schema errors as zod issues, or `{ error: "unknown slugs", unknown_industries, unknown_categories }`), 500 (DB failure, prior data intact), 200 `{ ok: true, date, items, entries }`.

- [ ] **Step 1: Implement lib/db.ts**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
```

- [ ] **Step 2: Implement app/api/ingest/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { ingestPayloadSchema } from "@/lib/ingest/schema";
import { validateSlugs } from "@/lib/ingest/validate-slugs";
import { transformPayload } from "@/lib/ingest/transform";
import { getServiceClient } from "@/lib/db";
import { safeEqual } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const expected = process.env.INGEST_TOKEN;
  if (!expected || !token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const db = getServiceClient();
  const [industriesRes, categoriesRes] = await Promise.all([
    db.from("industries").select("slug"),
    db.from("categories").select("slug"),
  ]);
  if (industriesRes.error || categoriesRes.error) {
    const message = industriesRes.error?.message ?? categoriesRes.error?.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const unknown = validateSlugs(
    parsed.data,
    new Set(industriesRes.data.map((r) => r.slug)),
    new Set(categoriesRes.data.map((r) => r.slug)),
  );
  if (unknown.unknownIndustries.length > 0 || unknown.unknownCategories.length > 0) {
    return NextResponse.json(
      {
        error: "unknown slugs — add them in Supabase (industries/categories tables) and re-run",
        unknown_industries: unknown.unknownIndustries,
        unknown_categories: unknown.unknownCategories,
      },
      { status: 422 },
    );
  }

  const t = transformPayload(parsed.data);
  const { error } = await db.rpc("replace_digest", {
    p_digest: t.digest,
    p_items: t.items,
    p_entries: t.entries,
    p_entry_sources: t.entrySources,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    date: parsed.data.date,
    items: t.items.length,
    entries: t.entries.length,
  });
}
```

- [ ] **Step 3: Verify auth and validation behavior against the dev server**

Start the dev server in the background, then:

```bash
# No token → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/ingest \
  -H "content-type: application/json" -d '{}'
# Expected: 401

# Good token, invalid body → 422
source .env.local 2>/dev/null || true
curl -s -X POST http://localhost:3000/api/ingest \
  -H "content-type: application/json" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -d '{"date":"bad"}'
# Expected: {"error":"invalid payload","issues":[...]}

# Good token, unknown slug → 422 naming the slug
curl -s -X POST http://localhost:3000/api/ingest \
  -H "content-type: application/json" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -d '{"date":"2026-07-07","entries":[{"category":"nope","title":"t","body":"b","position":0}],"items":[]}'
# Expected: unknown_categories contains "nope"
```

(If `source .env.local` doesn't parse, read `INGEST_TOKEN` out of the file manually.)

- [ ] **Step 4: Run full test suite**

```bash
npm test && npm run build
```

Expected: PASS, clean build.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts app/api/ingest/route.ts
git commit -m "feat: add supabase client and POST /api/ingest"
```

---

### Task 7: Ingest contract doc, sample payload, seed script — end-to-end ingest

**Files:**
- Create: `docs/ingest-contract.md`
- Create: `docs/sample-payload.json`
- Create: `scripts/seed.ts`

**Interfaces:**
- Consumes: `POST /api/ingest` (Task 6), `npm run seed` script wiring (Task 1).
- Produces: canonical contract doc the n8n workflow will be built against; a seeded local database with digest date `2026-07-07` (or today with `--today`).

- [ ] **Step 1: Write docs/ingest-contract.md**

````markdown
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
| `url` | string \| null | no | link to the original post/article |
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

## Responses

| status | meaning |
|---|---|
| 200 | `{ ok: true, date, items, entries }` — stored |
| 400 | body was not valid JSON |
| 401 | missing/wrong bearer token |
| 422 | schema violation (`issues`: zod detail) or unknown slugs (`unknown_industries`, `unknown_categories`) |
| 500 | database failure; previous data for that date is left intact |
````

- [ ] **Step 2: Write docs/sample-payload.json**

```json
{
  "date": "2026-07-07",
  "entries": [
    {
      "category": "big_event",
      "industry": "energy",
      "title": "DOE's $2.1B long-duration storage program is the day's biggest opportunity",
      "body": "The DOE announced $2.1B in funding for long-duration storage pilots, and the energy communities were already buzzing about Texas quietly crossing 12GW of battery storage. Grid-scale storage is moving from thesis to procurement — worth watching who wins the pilot slots.",
      "position": 0,
      "source_refs": ["n-energy-1", "r-energy-2"]
    },
    {
      "category": "world_news",
      "industry": null,
      "title": "EU passes landmark grid-interconnect funding package",
      "body": "Brussels approved a multi-year funding package for cross-border grid interconnects, a tailwind for European energy infrastructure suppliers.",
      "position": 0,
      "source_refs": ["n-world-1"]
    },
    {
      "category": "world_news",
      "industry": null,
      "title": "Panama Canal restrictions ease",
      "body": "Rainy season has replenished the locks; daily transit slots are returning to normal, relieving a persistent drag on trans-Pacific shipping schedules.",
      "position": 1,
      "source_refs": ["n-world-2"]
    },
    {
      "category": "community_sentiment",
      "industry": "energy",
      "title": "Energy communities: bullish on storage, anxious about summer load",
      "body": "r/energy is split between excitement over the storage buildout and worry about record summer demand forecasts. The storage optimism is the louder signal this week.",
      "position": 0,
      "source_refs": ["r-energy-1", "r-energy-2"]
    },
    {
      "category": "community_sentiment",
      "industry": "logistics",
      "title": "Freight sentiment cautiously turning",
      "body": "Brokers are reporting the first spot-rate upticks in eight months, and the tone in freight communities has shifted from capitulation to cautious optimism.",
      "position": 1,
      "source_refs": ["r-logistics-1", "r-logistics-2"]
    },
    {
      "category": "industry_events",
      "industry": "real-estate",
      "title": "Office-to-residential conversions starting to pencil out",
      "body": "CRE practitioners are posting real underwriting showing conversions working in second-tier CBDs for the first time this cycle, driven by distressed office basis.",
      "position": 0,
      "source_refs": ["r-realestate-1"]
    },
    {
      "category": "finance",
      "industry": null,
      "title": "Oil up, industrial REITs rally",
      "body": "WTI rose 2.3% to $81.40 on demand revisions, and Prologis jumped 4.1% after an earnings beat — a constructive read-through for both energy and logistics real estate.",
      "position": 0,
      "source_refs": ["m-1", "m-2"]
    },
    {
      "category": "opportunities",
      "industry": "logistics",
      "title": "Spot-rate inflection could reward early brokerage relationships",
      "body": "If the spot-rate turn holds, capacity tightens from here; relationships with small fleet owners formed during the downturn get valuable fast. The PLD earnings beat supports the demand-recovery read.",
      "position": 0,
      "source_refs": ["r-logistics-1", "m-2"]
    }
  ],
  "items": [
    {
      "key": "r-energy-1",
      "industry": "energy",
      "source_type": "reddit",
      "title": "Grid operators bracing for record summer demand",
      "url": "https://www.reddit.com/r/energy/comments/sample1",
      "summary": "ERCOT and PJM demand forecasts both point at records; thread debates whether storage additions arrive fast enough.",
      "metadata": { "subreddit": "energy", "score": 412, "comments": 87 },
      "position": 0
    },
    {
      "key": "r-energy-2",
      "industry": "energy",
      "source_type": "reddit",
      "title": "Texas battery storage quietly hit 12GW",
      "url": "https://www.reddit.com/r/energy/comments/sample2",
      "summary": "Milestone post with interconnection-queue data; commenters note merchant storage economics improving.",
      "metadata": { "subreddit": "energy", "score": 288, "comments": 54 },
      "position": 1
    },
    {
      "key": "n-energy-1",
      "industry": "energy",
      "source_type": "news",
      "title": "DOE announces $2.1B for long-duration storage pilots",
      "url": "https://example.com/doe-storage-pilots",
      "summary": "Funding targets 10+ hour duration technologies; applications open in Q4.",
      "metadata": { "source": "Utility Dive" },
      "position": 2
    },
    {
      "key": "r-logistics-1",
      "industry": "logistics",
      "source_type": "reddit",
      "title": "Freight brokers seeing spot rates tick up for the first time in 8 months",
      "url": "https://www.reddit.com/r/FreightBrokers/comments/sample3",
      "summary": "Multiple brokers report reefer and dry van spot rates up week-over-week.",
      "metadata": { "subreddit": "FreightBrokers", "score": 156, "comments": 61 },
      "position": 0
    },
    {
      "key": "r-logistics-2",
      "industry": "logistics",
      "source_type": "reddit",
      "title": "USPS regional consolidation megathread",
      "url": "https://www.reddit.com/r/logistics/comments/sample4",
      "summary": "Discussion of USPS network changes and their effect on last-mile contractors.",
      "metadata": { "subreddit": "logistics", "score": 94, "comments": 40 },
      "position": 1
    },
    {
      "key": "r-realestate-1",
      "industry": "real-estate",
      "source_type": "reddit",
      "title": "Are commercial-to-residential conversions actually penciling out now?",
      "url": "https://www.reddit.com/r/CommercialRealEstate/comments/sample5",
      "summary": "OP shares underwriting on a conversion at 40% of replacement cost; long thread of practitioners comparing markets.",
      "metadata": { "subreddit": "CommercialRealEstate", "score": 203, "comments": 118 },
      "position": 0
    },
    {
      "key": "n-world-1",
      "industry": null,
      "source_type": "news",
      "title": "EU passes landmark grid-interconnect funding package",
      "url": "https://example.com/eu-grid-funding",
      "summary": "Multi-year package funds cross-border transmission projects.",
      "metadata": { "source": "Reuters" },
      "position": 0
    },
    {
      "key": "n-world-2",
      "industry": null,
      "source_type": "news",
      "title": "Panama Canal restrictions ease as rainy season replenishes locks",
      "url": "https://example.com/panama-canal-easing",
      "summary": "Daily transit slots returning to pre-drought levels.",
      "metadata": { "source": "AP" },
      "position": 1
    },
    {
      "key": "m-1",
      "industry": null,
      "source_type": "market",
      "title": "WTI crude +2.3% to $81.40",
      "url": null,
      "summary": "Demand revisions from the IEA monthly report.",
      "metadata": { "ticker": "CL=F", "change_pct": 2.3 },
      "position": 0
    },
    {
      "key": "m-2",
      "industry": null,
      "source_type": "market",
      "title": "Prologis (PLD) +4.1% after earnings beat",
      "url": null,
      "summary": "Raised full-year guidance on logistics demand.",
      "metadata": { "ticker": "PLD", "change_pct": 4.1 },
      "position": 1
    }
  ]
}
```

- [ ] **Step 3: Write scripts/seed.ts**

```ts
// Seeds the app by POSTing docs/sample-payload.json through the real ingest
// endpoint, exercising the contract end-to-end. Usage:
//   npm run seed             → seeds with the payload's own date
//   npm run seed -- --today  → overrides the date to today
import { readFileSync } from "node:fs";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const token = process.env.INGEST_TOKEN;
if (!token) {
  console.error("INGEST_TOKEN is not set (expected in .env.local)");
  process.exit(1);
}

const payload = JSON.parse(readFileSync("docs/sample-payload.json", "utf8"));
if (process.argv.includes("--today")) {
  payload.date = new Date().toISOString().slice(0, 10);
}

const res = await fetch(`${appUrl}/api/ingest`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
});

const bodyText = await res.text();
console.log(`${res.status} ${bodyText}`);
if (!res.ok) process.exit(1);
```

- [ ] **Step 4: Run the seed end-to-end**

With the dev server running:

```bash
npm run seed
```

Expected output: `200 {"ok":true,"date":"2026-07-07","items":10,"entries":8}`

Run it a second time to confirm idempotency — same output, no duplicate-key error.

- [ ] **Step 5: Verify rows landed**

```bash
source .env.local 2>/dev/null || true
curl -s "$SUPABASE_URL/rest/v1/digest_entries?select=title&order=position" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Expected: 8 entry titles.

- [ ] **Step 6: Commit**

```bash
git add docs/ingest-contract.md docs/sample-payload.json scripts/seed.ts
git commit -m "feat: add ingest contract doc, sample payload, and seed script"
```

---

### Task 8: Login page, middleware, robots

**Files:**
- Create: `app/login/page.tsx`
- Create: `app/login/actions.ts`
- Create: `middleware.ts`
- Create: `app/robots.ts`
- Modify: `app/layout.tsx` (metadata: noindex + title)

**Interfaces:**
- Consumes: `createSessionToken`, `verifySessionToken`, `safeEqual` (Task 3).
- Produces: every route except `/login`, `/api/ingest`, and static assets requires a valid `digest_session` cookie; `login(formData)` server action.

- [ ] **Step 1: Implement app/login/actions.ts**

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, safeEqual } from "@/lib/auth";

const YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD;
  if (!expected || !safeEqual(password, expected)) {
    redirect("/login?error=1");
  }
  const token = await createSessionToken(process.env.COOKIE_SECRET!);
  (await cookies()).set("digest_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: YEAR_SECONDS,
    path: "/",
  });
  redirect("/");
}
```

- [ ] **Step 2: Implement app/login/page.tsx**

```tsx
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={login} className="w-full max-w-xs space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">Industry Digest</h1>
        {error && <p className="text-sm text-red-600">Wrong password.</p>}
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Implement middleware.ts (repo root)**

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("digest_session")?.value;
  const ok = await verifySessionToken(token, process.env.COOKIE_SECRET ?? "");
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except: login page, ingest API (bearer-authed), Next static
    // assets, and public files.
    "/((?!login|api/ingest|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};
```

- [ ] **Step 4: Implement app/robots.ts and metadata**

`app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
```

In `app/layout.tsx`, replace the scaffold's `metadata` export with:

```ts
export const metadata: Metadata = {
  title: "Industry Digest",
  description: "Personal daily industry intelligence",
  robots: { index: false, follow: false },
};
```

- [ ] **Step 5: Verify the auth flow manually**

With the dev server running:

```bash
# Unauthenticated request to / redirects to /login
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
# Expected: 307 http://localhost:3000/login

# Login page itself is reachable
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
# Expected: 200

# Ingest is NOT behind the cookie (bearer instead)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/ingest -d '{}'
# Expected: 401 (not 307)

# robots.txt reachable and disallowing
curl -s http://localhost:3000/robots.txt
# Expected: contains "Disallow: /"
```

Then in a browser: visit `http://localhost:3000`, get redirected to `/login`, enter a wrong password (see "Wrong password."), enter the right one, land on `/`.

- [ ] **Step 6: Run tests and build**

```bash
npm test && npm run build
```

Expected: PASS, clean build.

- [ ] **Step 7: Commit**

```bash
git add app/login middleware.ts app/robots.ts app/layout.tsx
git commit -m "feat: add password login, session middleware, and robots noindex"
```

---

### Task 9: Types, query layer, home feed, and date pages

**Files:**
- Create: `lib/types.ts`
- Create: `lib/queries.ts`
- Create: `app/(main)/layout.tsx`
- Create: `components/date-nav.tsx`
- Create: `components/date-picker.tsx`
- Create: `components/entry-card.tsx`
- Create: `components/source-link.tsx`
- Create: `components/digest-view.tsx`
- Create: `app/(main)/page.tsx`
- Create: `app/(main)/d/[date]/page.tsx`
- Modify: move/delete scaffold `app/page.tsx` (replaced by `app/(main)/page.tsx`); delete scaffold boilerplate in it.

**Interfaces:**
- Consumes: `getServiceClient` (Task 6), seeded data (Task 7), Supabase tables (Task 2).
- Produces:
  - Types: `Industry`, `Category`, `Digest`, `SourceItem`, `DigestEntry`, `EntryWithSources` (in `@/lib/types`).
  - Queries (all in `@/lib/queries`, all `async`):
    - `getDigestDates(): Promise<string[]>` — all digest dates, newest first.
    - `getDigestByDate(date: string): Promise<Digest | null>`
    - `getCategories(): Promise<Category[]>` — by `sort_order`.
    - `getActiveIndustries(): Promise<Industry[]>` — `active = true`, by `sort_order`.
    - `getIndustry(slug: string): Promise<Industry | null>` — regardless of `active` (history stays reachable by URL).
    - `getEntriesWithSources(digestId: string): Promise<EntryWithSources[]>`
    - `getIndustryItems(digestId: string, slug: string): Promise<SourceItem[]>`
    - `getIndustryEntries(digestId: string, slug: string): Promise<DigestEntry[]>`
  - Components: `<DigestView date dates isLatest? />` (server, renders a full digest page body), `<DateNav date dates />`, `<EntryCard entry />`, `<SourceLink item />`.
  - Route group `(main)` whose layout holds the site nav; Task 10 adds its page into this group.

- [ ] **Step 1: Implement lib/types.ts**

```ts
export type Industry = {
  slug: string;
  name: string;
  active: boolean;
  sort_order: number;
};

export type Category = {
  slug: string;
  name: string;
  sort_order: number;
};

export type Digest = {
  id: string;
  digest_date: string;
  created_at: string;
};

export type SourceItem = {
  id: string;
  digest_id: string;
  industry_slug: string | null;
  source_type: "reddit" | "news" | "market";
  title: string;
  url: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  position: number;
};

export type DigestEntry = {
  id: string;
  digest_id: string;
  category_slug: string;
  industry_slug: string | null;
  title: string;
  body: string;
  position: number;
};

export type EntryWithSources = DigestEntry & { sources: SourceItem[] };
```

- [ ] **Step 2: Implement lib/queries.ts**

```ts
import { getServiceClient } from "@/lib/db";
import type {
  Category,
  Digest,
  DigestEntry,
  EntryWithSources,
  Industry,
  SourceItem,
} from "@/lib/types";

export async function getDigestDates(): Promise<string[]> {
  const { data, error } = await getServiceClient()
    .from("digests")
    .select("digest_date")
    .order("digest_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => d.digest_date as string);
}

export async function getDigestByDate(date: string): Promise<Digest | null> {
  const { data, error } = await getServiceClient()
    .from("digests")
    .select("id, digest_date, created_at")
    .eq("digest_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Digest | null;
}

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await getServiceClient()
    .from("categories")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

export async function getActiveIndustries(): Promise<Industry[]> {
  const { data, error } = await getServiceClient()
    .from("industries")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Industry[];
}

export async function getIndustry(slug: string): Promise<Industry | null> {
  const { data, error } = await getServiceClient()
    .from("industries")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Industry | null;
}

type EntryRow = DigestEntry & {
  entry_sources: Array<{ source_items: SourceItem | null }> | null;
};

export async function getEntriesWithSources(
  digestId: string,
): Promise<EntryWithSources[]> {
  const { data, error } = await getServiceClient()
    .from("digest_entries")
    .select("*, entry_sources(source_items(*))")
    .eq("digest_id", digestId)
    .order("position");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as EntryRow[]).map(
    ({ entry_sources, ...entry }) => ({
      ...entry,
      sources: (entry_sources ?? [])
        .map((es) => es.source_items)
        .filter((s): s is SourceItem => s !== null)
        .sort((a, b) => a.position - b.position),
    }),
  );
}

export async function getIndustryItems(
  digestId: string,
  slug: string,
): Promise<SourceItem[]> {
  const { data, error } = await getServiceClient()
    .from("source_items")
    .select("*")
    .eq("digest_id", digestId)
    .eq("industry_slug", slug)
    .order("source_type")
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as SourceItem[];
}

export async function getIndustryEntries(
  digestId: string,
  slug: string,
): Promise<DigestEntry[]> {
  const { data, error } = await getServiceClient()
    .from("digest_entries")
    .select("*")
    .eq("digest_id", digestId)
    .eq("industry_slug", slug)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as DigestEntry[];
}
```

- [ ] **Step 3: Implement the (main) layout with nav**

Create `app/(main)/layout.tsx`:

```tsx
import Link from "next/link";
import { getActiveIndustries } from "@/lib/queries";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const industries = await getActiveIndustries();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-8 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="flex items-baseline justify-between gap-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Industry Digest
          </Link>
        </div>
        <nav className="mt-2 flex gap-x-3 gap-y-1 overflow-x-auto text-sm text-neutral-500 dark:text-neutral-400">
          {industries.map((ind) => (
            <Link
              key={ind.slug}
              href={`/industry/${ind.slug}`}
              className="whitespace-nowrap hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {ind.name}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
```

Note: the scaffold's `app/page.tsx` moves to `app/(main)/page.tsx` (Step 7). Route groups don't change URLs — `/` still resolves. Delete any scaffold demo markup.

- [ ] **Step 4: Implement DateNav and DatePicker components**

Create `components/date-picker.tsx` (client component — navigation on change):

```tsx
"use client";

import { useRouter } from "next/navigation";

export function DatePicker({ current }: { current: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      defaultValue={current}
      onChange={(e) => {
        if (e.target.value) router.push(`/d/${e.target.value}`);
      }}
      className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
      aria-label="Jump to date"
    />
  );
}
```

Create `components/date-nav.tsx` (server component):

```tsx
import Link from "next/link";
import { DatePicker } from "@/components/date-picker";

export function DateNav({ date, dates }: { date: string; dates: string[] }) {
  // dates is newest-first; "prev" = older digest, "next" = newer digest.
  const idx = dates.indexOf(date);
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;
  const newer = idx > 0 ? dates[idx - 1] : null;
  const latest = dates[0];

  return (
    <div className="mb-8 flex items-center gap-3 text-sm">
      {older ? (
        <Link href={`/d/${older}`} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          ← {older}
        </Link>
      ) : (
        <span className="text-neutral-300 dark:text-neutral-700">← older</span>
      )}
      <DatePicker current={date} />
      {newer ? (
        <Link href={`/d/${newer}`} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          {newer} →
        </Link>
      ) : (
        <span className="text-neutral-300 dark:text-neutral-700">newer →</span>
      )}
      {date !== latest && latest && (
        <Link href="/" className="ml-auto text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100">
          Latest
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement SourceLink and EntryCard components**

Create `components/source-link.tsx`:

```tsx
import type { SourceItem } from "@/lib/types";

function sourceLabel(item: SourceItem): string {
  if (item.source_type === "reddit" && typeof item.metadata.subreddit === "string") {
    return `r/${item.metadata.subreddit}`;
  }
  if (typeof item.metadata.source === "string") return item.metadata.source;
  if (typeof item.metadata.ticker === "string") return item.metadata.ticker;
  if (item.url) {
    try {
      return new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      /* fall through */
    }
  }
  return item.source_type;
}

export function SourceLink({ item }: { item: SourceItem }) {
  const label = sourceLabel(item);
  const cls =
    "rounded-full border border-neutral-200 px-2 py-0.5 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400";
  if (!item.url) {
    return <span className={cls} title={item.title}>{label}</span>;
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      title={item.title}
      className={`${cls} hover:border-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100`}
    >
      {label} ↗
    </a>
  );
}
```

Create `components/entry-card.tsx`:

```tsx
import Link from "next/link";
import type { EntryWithSources, Industry } from "@/lib/types";
import { SourceLink } from "@/components/source-link";

export function EntryCard({
  entry,
  industriesBySlug,
  date,
  spotlight = false,
}: {
  entry: EntryWithSources;
  industriesBySlug: Map<string, Industry>;
  date: string;
  spotlight?: boolean;
}) {
  const industry = entry.industry_slug
    ? industriesBySlug.get(entry.industry_slug)
    : undefined;
  return (
    <article
      className={
        spotlight
          ? "rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900"
          : "border-b border-neutral-100 pb-4 last:border-b-0 dark:border-neutral-900"
      }
    >
      <h3 className={spotlight ? "text-lg font-semibold" : "font-medium"}>
        {entry.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
        {entry.body}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {industry && (
          <Link
            href={`/industry/${industry.slug}?date=${date}`}
            className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            {industry.name}
          </Link>
        )}
        {entry.sources.map((s) => (
          <SourceLink key={s.id} item={s} />
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 6: Implement DigestView**

Create `components/digest-view.tsx` (server component):

```tsx
import { DateNav } from "@/components/date-nav";
import { EntryCard } from "@/components/entry-card";
import {
  getActiveIndustries,
  getCategories,
  getDigestByDate,
  getEntriesWithSources,
} from "@/lib/queries";

export async function DigestView({
  date,
  dates,
  isLatest = false,
}: {
  date: string;
  dates: string[];
  isLatest?: boolean;
}) {
  const digest = await getDigestByDate(date);
  if (!digest) {
    return (
      <main>
        <DateNav date={date} dates={dates} />
        <p className="text-neutral-500">No digest for {date}.</p>
      </main>
    );
  }

  const [categories, industries, entries] = await Promise.all([
    getCategories(),
    getActiveIndustries(),
    getEntriesWithSources(digest.id),
  ]);
  const industriesBySlug = new Map(industries.map((i) => [i.slug, i]));
  const today = new Date().toISOString().slice(0, 10);
  // The first category by sort_order renders as the spotlight.
  const [spotlightCategory, ...restCategories] = categories;
  const byCategory = (slug: string) =>
    entries.filter((e) => e.category_slug === slug);

  return (
    <main>
      <DateNav date={date} dates={dates} />
      {isLatest && date !== today && (
        <p className="mb-6 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          No digest yet today — showing the latest from {date}.
        </p>
      )}
      <div className="space-y-10">
        {spotlightCategory && byCategory(spotlightCategory.slug).length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
              {spotlightCategory.name}
            </h2>
            <div className="space-y-4">
              {byCategory(spotlightCategory.slug).map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  industriesBySlug={industriesBySlug}
                  date={date}
                  spotlight
                />
              ))}
            </div>
          </section>
        )}
        {restCategories.map((cat) => {
          const catEntries = byCategory(cat.slug);
          if (catEntries.length === 0) return null;
          return (
            <section key={cat.slug}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {cat.name}
              </h2>
              <div className="space-y-4">
                {catEntries.map((e) => (
                  <EntryCard
                    key={e.id}
                    entry={e}
                    industriesBySlug={industriesBySlug}
                    date={date}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Implement the pages**

Move the scaffold home page: delete `app/page.tsx` (scaffold demo) and create `app/(main)/page.tsx`:

```tsx
import { DigestView } from "@/components/digest-view";
import { getDigestDates } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const dates = await getDigestDates();
  if (dates.length === 0) {
    return (
      <main>
        <p className="text-neutral-500">
          No digests yet. Once the daily pipeline runs, they&apos;ll land here.
        </p>
      </main>
    );
  }
  return <DigestView date={dates[0]} dates={dates} isLatest />;
}
```

Create `app/(main)/d/[date]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { DigestView } from "@/components/digest-view";
import { getDigestDates } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DigestByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const dates = await getDigestDates();
  return <DigestView date={date} dates={dates} />;
}
```

- [ ] **Step 8: Verify in the browser**

With the dev server running and data seeded (Task 7), log in and check:

1. `/` shows the 2026-07-07 digest: spotlight "Biggest Event" section on top, then World News, Community Sentiment, Industry Events, Finance, Opportunities.
2. Entry cards show source chips (e.g. `r/energy ↗`, `Utility Dive ↗`, `CL=F`) linking out, and industry chips (Energy, Logistics, Real Estate).
3. `/d/2026-07-07` renders the same digest; `/d/2026-01-01` shows "No digest for 2026-01-01." with nav intact; `/d/garbage` 404s.
4. The date picker navigates; prev/next are disabled appropriately (single digest → both grey).

```bash
npm test && npm run build
```

Expected: PASS, clean build.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add query layer, home feed, and date pages"
```

---

### Task 10: Per-industry drill-down page

**Files:**
- Create: `app/(main)/industry/[slug]/page.tsx`
- Create: `components/source-item-card.tsx`

**Interfaces:**
- Consumes: `getIndustry`, `getDigestDates`, `getDigestByDate`, `getIndustryItems`, `getIndustryEntries` (Task 9), `DateNav`, `SourceLink` behavior conventions.
- Produces: `/industry/[slug]?date=YYYY-MM-DD` (date defaults to latest digest date). Pure DB read — never triggers scraping.

- [ ] **Step 1: Implement components/source-item-card.tsx**

```tsx
import type { SourceItem } from "@/lib/types";

export function SourceItemCard({ item }: { item: SourceItem }) {
  const meta: string[] = [];
  if (typeof item.metadata.subreddit === "string") meta.push(`r/${item.metadata.subreddit}`);
  if (typeof item.metadata.source === "string") meta.push(item.metadata.source);
  if (typeof item.metadata.ticker === "string") meta.push(String(item.metadata.ticker));
  if (typeof item.metadata.score === "number") meta.push(`▲ ${item.metadata.score}`);
  if (typeof item.metadata.comments === "number") meta.push(`${item.metadata.comments} comments`);

  return (
    <article className="border-b border-neutral-100 py-3 last:border-b-0 dark:border-neutral-900">
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium hover:underline"
        >
          {item.title} ↗
        </a>
      ) : (
        <span className="font-medium">{item.title}</span>
      )}
      {item.summary && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{item.summary}</p>
      )}
      {meta.length > 0 && (
        <p className="mt-1 text-xs text-neutral-400">{meta.join(" · ")}</p>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Implement app/(main)/industry/[slug]/page.tsx**

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { SourceItemCard } from "@/components/source-item-card";
import {
  getDigestByDate,
  getDigestDates,
  getIndustry,
  getIndustryEntries,
  getIndustryItems,
} from "@/lib/queries";
import type { SourceItem } from "@/lib/types";

export const dynamic = "force-dynamic";

const GROUPS: Array<{ type: SourceItem["source_type"]; label: string }> = [
  { type: "reddit", label: "Reddit" },
  { type: "news", label: "News" },
  { type: "market", label: "Market" },
];

export default async function IndustryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { slug } = await params;
  const { date: dateParam } = await searchParams;

  const industry = await getIndustry(slug);
  if (!industry) notFound();

  const dates = await getDigestDates();
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : dates[0];

  const digest = date ? await getDigestByDate(date) : null;
  const [items, entries] = digest
    ? await Promise.all([
        getIndustryItems(digest.id, slug),
        getIndustryEntries(digest.id, slug),
      ])
    : [[], []];

  return (
    <main>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{industry.name}</h1>
        {date && (
          <Link href={`/d/${date}`} className="text-sm text-neutral-500 underline">
            digest for {date}
          </Link>
        )}
      </div>

      {!digest && (
        <p className="text-neutral-500">
          {date ? `No digest for ${date}.` : "No digests yet."}
        </p>
      )}

      {digest && entries.length > 0 && (
        <section className="mb-8 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-neutral-400">
            In today&apos;s digest
          </h2>
          {entries.map((e) => (
            <div key={e.id} className="py-2">
              <h3 className="font-medium">{e.title}</h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{e.body}</p>
            </div>
          ))}
        </section>
      )}

      {digest &&
        GROUPS.map(({ type, label }) => {
          const group = items.filter((i) => i.source_type === type);
          if (group.length === 0) return null;
          return (
            <section key={type} className="mb-8">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-neutral-400">
                {label}
              </h2>
              {group.map((item) => (
                <SourceItemCard key={item.id} item={item} />
              ))}
            </section>
          );
        })}

      {digest && items.length === 0 && (
        <p className="text-neutral-500">
          Nothing was pulled for {industry.name} on {date}.
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Verify in the browser**

With dev server running and seeded data:

1. Click "Energy" in the nav → shows the "In today's digest" box (big_event + sentiment entries) and Reddit (2 posts) + News (1 article) sections, all linking out.
2. `/industry/logistics?date=2026-07-07` → 2 reddit posts + logistics entries.
3. `/industry/agriculture` → "Nothing was pulled for Agriculture on 2026-07-07."
4. `/industry/not-a-slug` → 404.
5. From a home-feed entry, click its industry chip → lands on the right industry+date.

```bash
npm test && npm run build
```

Expected: PASS, clean build.

- [ ] **Step 4: Commit**

```bash
git add app/\(main\)/industry components/source-item-card.tsx
git commit -m "feat: add per-industry drill-down page"
```

---

### Task 11: Deploy to Vercel — USER CHECKPOINT

**Files:**
- None new (configuration only; possibly `vercel.json` is NOT needed)

**Interfaces:**
- Consumes: everything.
- Produces: live production URL, seeded, password-gated; `docs/ingest-contract.md` updated with the production URL if the user wants.

- [ ] **Step 1: USER CHECKPOINT — repo hosting and Vercel link**

Ask the user how they want to deploy:
- **Option A (recommended):** push the repo to GitHub (private) and import it in the Vercel dashboard — gives automatic deploys on push.
- **Option B:** `npx vercel` CLI deploy from the local directory.

Help execute whichever they pick (create the GitHub repo with `gh repo create --private` if they choose A and have `gh` authenticated).

- [ ] **Step 2: Set production env vars**

In the Vercel project (dashboard → Settings → Environment Variables, or `npx vercel env add`), set for Production:

- `SUPABASE_URL` — same value as local
- `SUPABASE_SERVICE_ROLE_KEY` — same value as local
- `APP_PASSWORD` — user's choice (can differ from local)
- `INGEST_TOKEN` — same value the n8n workflow will use
- `COOKIE_SECRET` — fresh value fine (`openssl rand -hex 32`)

- [ ] **Step 3: Deploy and verify**

After the first production deploy completes, with `PROD_URL` set to the deployment URL:

```bash
# Password gate up
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" $PROD_URL/
# Expected: 307 → /login

# robots disallows
curl -s $PROD_URL/robots.txt
# Expected: Disallow: /

# Seed production
APP_URL=$PROD_URL npm run seed -- --today
# Expected: 200 {"ok":true,...}
```

Then have the user log in at the production URL in a browser and confirm the digest renders (dated today), industry drill-down works, and source links open.

- [ ] **Step 4: Final commit and wrap-up notes**

```bash
git add -A
git commit -m "chore: deployment configuration" --allow-empty
```

Tell the user:
- The production ingest endpoint + token are what the future n8n workflow needs (per `docs/ingest-contract.md`).
- Industries/categories are managed by hand in the Supabase table editor; new slugs must exist there before a payload using them will be accepted.

---

## Plan Self-Review (completed)

- **Spec coverage:** all six tables + RLS + `replace_digest` (Task 2); ingest endpoint with 401/400/422/500 semantics, idempotency, slug rejection (Tasks 4–6); contract doc + sample payload + seed-through-real-endpoint (Task 7); login/middleware/cookie/robots (Task 8); home feed with spotlight, empty states, date nav, `/d/[date]` (Task 9); industry drill-down with `?date=` default-latest, inactive-industry URLs still resolving (Task 10); Vercel deploy + env vars (Task 11). Future tables intentionally not built (spec: out of scope).
- **Placeholder scan:** none — every code step contains complete code; the two USER CHECKPOINTs are genuine external dependencies (Supabase account, Vercel account), not placeholders.
- **Type consistency:** `TransformResult` row shapes match `replace_digest` jsonb field names (`digest_date`, `industry_slug`, `category_slug`, `entry_id`, `source_item_id`); query return types match `lib/types.ts`; `safeEqual`/`createSessionToken`/`verifySessionToken` signatures consistent across Tasks 3, 6, 8; route group `(main)` used consistently in Tasks 9–10.

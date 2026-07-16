# Entry Detail Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every digest entry becomes clickable, opening `/entry/[id]` with an on-demand cached AI deep dive, personalized business angles, and an ephemeral entry-scoped chat bot.

**Architecture:** Two new Supabase tables (`entry_deep_dives` cache, single-row `app_profile`). Detail page is a server component that renders instantly; a client component streams generation from `POST /api/entries/[id]/deep-dive` on cache miss and saves on completion. Chat is stateless: `POST /api/entries/[id]/chat` rebuilds context per call and streams back. Both routes call Anthropic (Sonnet 5 + web search server tool) and do their own session-cookie check.

**Tech Stack:** Next.js 16.2.10 (App Router), Supabase (service-role client), `@anthropic-ai/sdk`, `react-markdown`, zod 4, vitest.

**Spec:** `docs/superpowers/specs/2026-07-09-entry-detail-pages-design.md`

## Global Constraints

- Model is exactly `claude-sonnet-5` (user's explicit choice; do NOT substitute another model).
- Web search tool is `{ type: "web_search_20260209", name: "web_search", max_uses: 3 }` — supported on Sonnet 5.
- Never pass `temperature`, `top_p`, `top_k`, or `thinking: {type:"enabled", budget_tokens}` — all 400 on Sonnet 5. Omit `thinking` entirely (adaptive is the default).
- Next 16: `params` and `searchParams` on pages/routes are Promises — always `await` them.
- This project's AGENTS.md: consult `node_modules/next/dist/docs/` before using unfamiliar Next APIs.
- All automated tests are mocked — never call the live Anthropic API or Supabase from tests (user preference: Rayyan runs live verification himself).
- New tables get RLS enabled with no policies (service-role-only), matching every existing table.
- Match existing code style: no semicolon-free style, double quotes, `@/` imports, error handling like `app/api/ingest/route.ts`.
- Env vars: `ANTHROPIC_API_KEY` must be present in `.env.local` (already has SUPABASE_*, INGEST_TOKEN, COOKIE_SECRET, APP_PASSWORD).
- Run tests with `npm test` (vitest run). Commit after each task.

---

### Task 1: Branch, DB migration, and types

**Files:**
- Create: `supabase/migration-002-deep-dives.sql`
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: SQL tables `entry_deep_dives`, `app_profile`; TS types `Angle`, `DeepDive`, `EntryWithSources` (existing) used by all later tasks.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/entry-detail-pages
```

- [ ] **Step 2: Write the migration SQL**

Create `supabase/migration-002-deep-dives.sql`:

```sql
-- Migration 002: entry deep dives + user profile.
-- Run in the Supabase SQL editor after schema.sql.

create table entry_deep_dives (
  entry_id uuid primary key references digest_entries(id) on delete cascade,
  summary text not null,
  angles jsonb not null default '[]'::jsonb,
  sources_used jsonb not null default '[]'::jsonb,
  model text not null,
  created_at timestamptz not null default now()
);

create table app_profile (
  id int primary key default 1 check (id = 1),
  bio text not null default '',
  updated_at timestamptz not null default now()
);

insert into app_profile (id) values (1);

-- Service-role only, like every other table.
alter table entry_deep_dives enable row level security;
alter table app_profile enable row level security;
```

- [ ] **Step 3: Add TS types**

Append to `lib/types.ts`:

```typescript
export type Angle = {
  title: string;
  rationale: string;
  first_move: string;
};

export type DeepDiveSource = { title: string; url: string };

export type DeepDive = {
  entry_id: string;
  summary: string;
  angles: Angle[];
  sources_used: DeepDiveSource[];
  model: string;
  created_at: string;
};
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migration-002-deep-dives.sql lib/types.ts
git commit -m "feat: add deep-dive and profile schema + types"
```

> **Note for the human:** the SQL must be run manually in the Supabase SQL editor before live testing (not before unit tests — those are mocked).

---

### Task 2: Query layer additions

**Files:**
- Modify: `lib/queries.ts`

**Interfaces:**
- Consumes: `getServiceClient()` from `@/lib/db`; types from Task 1.
- Produces (exact signatures, all exported from `@/lib/queries`):
  - `getEntryWithSourcesById(entryId: string): Promise<EntryWithSources | null>`
  - `getDigestById(digestId: string): Promise<Digest | null>`
  - `getDeepDive(entryId: string): Promise<DeepDive | null>`
  - `upsertDeepDive(row: Omit<DeepDive, "created_at">): Promise<void>`
  - `deleteDeepDive(entryId: string): Promise<void>`
  - `getProfileBio(): Promise<string>`
  - `saveProfileBio(bio: string): Promise<void>`

Existing `getEntriesWithSources(digestId)` is reused for "other entries that day" — do not duplicate it.

- [ ] **Step 1: Add the queries**

Append to `lib/queries.ts` (add `DeepDive` to the existing type import from `@/lib/types`):

```typescript
export async function getEntryWithSourcesById(
  entryId: string,
): Promise<EntryWithSources | null> {
  const { data, error } = await getServiceClient()
    .from("digest_entries")
    .select("*, entry_sources(source_items(*))")
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { entry_sources, ...entry } = data as unknown as EntryRow;
  return {
    ...entry,
    sources: (entry_sources ?? [])
      .map((es) => es.source_items)
      .filter((s): s is SourceItem => s !== null)
      .sort((a, b) => a.position - b.position),
  };
}

export async function getDigestById(digestId: string): Promise<Digest | null> {
  const { data, error } = await getServiceClient()
    .from("digests")
    .select("id, digest_date, created_at")
    .eq("id", digestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Digest | null;
}

export async function getDeepDive(entryId: string): Promise<DeepDive | null> {
  const { data, error } = await getServiceClient()
    .from("entry_deep_dives")
    .select("*")
    .eq("entry_id", entryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as DeepDive | null;
}

export async function upsertDeepDive(
  row: Omit<DeepDive, "created_at">,
): Promise<void> {
  const { error } = await getServiceClient()
    .from("entry_deep_dives")
    .upsert(row);
  if (error) throw new Error(error.message);
}

export async function deleteDeepDive(entryId: string): Promise<void> {
  const { error } = await getServiceClient()
    .from("entry_deep_dives")
    .delete()
    .eq("entry_id", entryId);
  if (error) throw new Error(error.message);
}

export async function getProfileBio(): Promise<string> {
  const { data, error } = await getServiceClient()
    .from("app_profile")
    .select("bio")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.bio as string) ?? "";
}

export async function saveProfileBio(bio: string): Promise<void> {
  const { error } = await getServiceClient()
    .from("app_profile")
    .upsert({ id: 1, bio, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (No unit tests for the query layer — matches the existing codebase, which doesn't test `lib/queries.ts`.)

- [ ] **Step 3: Commit**

```bash
git add lib/queries.ts
git commit -m "feat: add deep-dive and profile queries"
```

---

### Task 3: API session auth helper (TDD)

**Files:**
- Create: `lib/api-auth.ts`
- Test: `lib/api-auth.test.ts`

**Interfaces:**
- Consumes: `verifySessionToken`, `createSessionToken` from `@/lib/auth`.
- Produces: `hasValidSession(req: NextRequest): Promise<boolean>` — used by both API routes. Reads the `digest_session` cookie, verifies against `COOKIE_SECRET`, fails closed if the secret is missing.

- [ ] **Step 1: Write the failing tests**

Create `lib/api-auth.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth";
import { hasValidSession } from "@/lib/api-auth";

const SECRET = "test-secret";

function reqWithCookie(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) {
    headers.set("cookie", `digest_session=${token}`);
  }
  return new NextRequest("http://localhost/api/entries/x/deep-dive", {
    method: "POST",
    headers,
  });
}

describe("hasValidSession", () => {
  const original = process.env.COOKIE_SECRET;
  beforeEach(() => {
    process.env.COOKIE_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.COOKIE_SECRET = original;
  });

  it("accepts a valid session token", async () => {
    const token = await createSessionToken(SECRET);
    expect(await hasValidSession(reqWithCookie(token))).toBe(true);
  });

  it("rejects a missing cookie", async () => {
    expect(await hasValidSession(reqWithCookie())).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken("other-secret");
    expect(await hasValidSession(reqWithCookie(token))).toBe(false);
  });

  it("fails closed when COOKIE_SECRET is unset", async () => {
    const token = await createSessionToken(SECRET);
    delete process.env.COOKIE_SECRET;
    expect(await hasValidSession(reqWithCookie(token))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/api-auth.test.ts`
Expected: FAIL — cannot resolve `@/lib/api-auth`.

- [ ] **Step 3: Write the implementation**

Create `lib/api-auth.ts`:

```typescript
import { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth";

// API routes are covered by the proxy matcher too, but a redirect-to-login is
// the wrong response for fetch() callers; routes use this to return 401.
export async function hasValidSession(req: NextRequest): Promise<boolean> {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) return false;
  const token = req.cookies.get("digest_session")?.value;
  return verifySessionToken(token, secret);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/api-auth.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/api-auth.ts lib/api-auth.test.ts
git commit -m "feat: add session auth helper for API routes"
```

---

### Task 4: Deep-dive prompt builder (TDD)

**Files:**
- Create: `lib/deepdive/prompt.ts`
- Test: `lib/deepdive/prompt.test.ts`

**Interfaces:**
- Consumes: `EntryWithSources`, `DigestEntry` from `@/lib/types`.
- Produces:
  - `buildDeepDivePrompt(args: { entry: EntryWithSources; dayEntries: DigestEntry[]; bio: string; date: string }): { system: string; user: string }`
  - `buildChatSystemPrompt(args: { entry: EntryWithSources; dayEntries: DigestEntry[]; deepDiveSummary: string; bio: string; date: string }): string`
  - `ANGLES_DELIMITER = "===ANGLES==="` (exported const — the parser in Task 5 splits on it)

- [ ] **Step 1: Write the failing tests**

Create `lib/deepdive/prompt.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  ANGLES_DELIMITER,
  buildChatSystemPrompt,
  buildDeepDivePrompt,
} from "@/lib/deepdive/prompt";
import type { DigestEntry, EntryWithSources } from "@/lib/types";

const entry: EntryWithSources = {
  id: "e1",
  digest_id: "d1",
  category_slug: "big_event",
  industry_slug: "energy",
  title: "Oil markets spike",
  body: "Crude jumped to $78.",
  position: 0,
  sources: [
    {
      id: "s1",
      digest_id: "d1",
      industry_slug: "energy",
      source_type: "news",
      title: "BBC: oil surges",
      url: "https://bbc.com/x",
      summary: "Oil prices surged after strikes.",
      metadata: {},
      position: 0,
    },
  ],
};

const dayEntries: DigestEntry[] = [
  entry,
  {
    id: "e2",
    digest_id: "d1",
    category_slug: "world_news",
    industry_slug: null,
    title: "Ukraine missile license",
    body: "Domestic Patriot production announced.",
    position: 0,
  },
];

describe("buildDeepDivePrompt", () => {
  const { system, user } = buildDeepDivePrompt({
    entry,
    dayEntries,
    bio: "USC student interested in logistics startups",
    date: "2026-07-08",
  });

  it("includes the entry, its sources, and the date", () => {
    expect(user).toContain("Oil markets spike");
    expect(user).toContain("BBC: oil surges");
    expect(user).toContain("2026-07-08");
  });

  it("includes other entries from the day but not the entry itself twice", () => {
    expect(user).toContain("Ukraine missile license");
    // The focal entry appears once in its own section, not in the day context.
    expect(user.split("Oil markets spike").length - 1).toBe(1);
  });

  it("includes the profile bio and the angles delimiter instruction", () => {
    expect(system).toContain("USC student interested in logistics startups");
    expect(system).toContain(ANGLES_DELIMITER);
  });

  it("omits the profile section when bio is empty", () => {
    const { system: s2 } = buildDeepDivePrompt({
      entry,
      dayEntries,
      bio: "",
      date: "2026-07-08",
    });
    expect(s2).not.toContain("About the reader");
  });
});

describe("buildChatSystemPrompt", () => {
  it("includes entry, deep dive, day context, and bio", () => {
    const system = buildChatSystemPrompt({
      entry,
      dayEntries,
      deepDiveSummary: "The oil spike traces to strait tensions.",
      bio: "USC student",
      date: "2026-07-08",
    });
    expect(system).toContain("Oil markets spike");
    expect(system).toContain("strait tensions");
    expect(system).toContain("Ukraine missile license");
    expect(system).toContain("USC student");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/deepdive/prompt.test.ts`
Expected: FAIL — cannot resolve `@/lib/deepdive/prompt`.

- [ ] **Step 3: Write the implementation**

Create `lib/deepdive/prompt.ts`:

```typescript
import type { DigestEntry, EntryWithSources } from "@/lib/types";

export const ANGLES_DELIMITER = "===ANGLES===";

function sourcesBlock(entry: EntryWithSources): string {
  if (entry.sources.length === 0) return "(no linked source items)";
  return entry.sources
    .map(
      (s) =>
        `- [${s.source_type}] ${s.title}${s.url ? ` (${s.url})` : ""}${
          s.summary ? ` — ${s.summary}` : ""
        }`,
    )
    .join("\n");
}

function dayContextBlock(entry: EntryWithSources, dayEntries: DigestEntry[]): string {
  const others = dayEntries.filter((e) => e.id !== entry.id);
  if (others.length === 0) return "(no other entries)";
  return others
    .map((e) => `- [${e.category_slug}] ${e.title}: ${e.body}`)
    .join("\n");
}

function bioBlock(bio: string): string {
  if (!bio.trim()) return "";
  return `\n\nAbout the reader (use this to personalize business angles):\n${bio.trim()}`;
}

export function buildDeepDivePrompt({
  entry,
  dayEntries,
  bio,
  date,
}: {
  entry: EntryWithSources;
  dayEntries: DigestEntry[];
  bio: string;
  date: string;
}): { system: string; user: string } {
  const system = `You are the deep-dive analyst for a personal industry-intelligence digest.
Given one digest entry, its raw sources, and the day's broader context, write a
detailed analysis. Use web search (up to 3 searches) to add background, key
players, and developments beyond the stored summaries — but stay grounded;
never invent facts.

Output format (strict):
1. A markdown analysis (~300-500 words). Use short ## section headings. No
   top-level title — the page already shows one.
2. Then a line containing exactly ${ANGLES_DELIMITER}
3. Then a raw JSON array (no markdown fences) of 2-4 business angles:
   [{ "title": string, "rationale": string, "first_move": string }]
   - "rationale": why this angle fits this story${bio.trim() ? " and this reader" : ""} (2-3 sentences).
   - "first_move": the concrete first step to explore it (1 sentence).${bioBlock(bio)}`;

  const user = `Digest date: ${date}

## The entry to analyze
Category: ${entry.category_slug}
Industry: ${entry.industry_slug ?? "(none)"}
Title: ${entry.title}
Summary: ${entry.body}

## Its raw sources
${sourcesBlock(entry)}

## Other entries from the same day (context)
${dayContextBlock(entry, dayEntries)}

Write the deep dive now.`;

  return { system, user };
}

export function buildChatSystemPrompt({
  entry,
  dayEntries,
  deepDiveSummary,
  bio,
  date,
}: {
  entry: EntryWithSources;
  dayEntries: DigestEntry[];
  deepDiveSummary: string;
  bio: string;
  date: string;
}): string {
  return `You are a sharp, concise analyst chatting about one story from a
personal industry-intelligence digest dated ${date}. Answer questions, explore
business implications, and use web search (up to 3 searches per reply) for
anything beyond the provided context. Keep replies conversational — a few
short paragraphs at most.

## The story
Category: ${entry.category_slug} | Industry: ${entry.industry_slug ?? "(none)"}
Title: ${entry.title}
Summary: ${entry.body}

## Its raw sources
${sourcesBlock(entry)}

## The deep-dive analysis already shown to the user
${deepDiveSummary}

## Other entries from the same day
${dayContextBlock(entry, dayEntries)}${bioBlock(bio)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/deepdive/prompt.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add lib/deepdive/prompt.ts lib/deepdive/prompt.test.ts
git commit -m "feat: add deep-dive and chat prompt builders"
```

---

### Task 5: Response parsing (TDD)

**Files:**
- Create: `lib/deepdive/parse.ts`
- Test: `lib/deepdive/parse.test.ts`

**Interfaces:**
- Consumes: `ANGLES_DELIMITER` from Task 4; `Angle`, `DeepDiveSource` from `@/lib/types`.
- Produces:
  - `parseDeepDive(text: string): { summary: string; angles: Angle[] }` — never throws; malformed angles → `angles: []` with the full text kept as summary.
  - `extractCitedSources(content: unknown[]): DeepDiveSource[]` — walks Anthropic message content blocks, collects `citations` entries carrying `url`, dedupes by URL.

- [ ] **Step 1: Write the failing tests**

Create `lib/deepdive/parse.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { extractCitedSources, parseDeepDive } from "@/lib/deepdive/parse";
import { ANGLES_DELIMITER } from "@/lib/deepdive/prompt";

const GOOD = `## What happened

Oil spiked on strait tensions.

${ANGLES_DELIMITER}
[{"title": "Logistics hedging tools", "rationale": "Shippers need it.", "first_move": "Interview 3 freight brokers."}]`;

describe("parseDeepDive", () => {
  it("splits summary and angles on the delimiter", () => {
    const { summary, angles } = parseDeepDive(GOOD);
    expect(summary).toContain("Oil spiked");
    expect(summary).not.toContain(ANGLES_DELIMITER);
    expect(angles).toHaveLength(1);
    expect(angles[0].title).toBe("Logistics hedging tools");
  });

  it("tolerates markdown fences around the angles JSON", () => {
    const fenced = GOOD.replace("[{", "```json\n[{").replace("}]", "}]\n```");
    expect(parseDeepDive(fenced).angles).toHaveLength(1);
  });

  it("falls back to full text + empty angles when the delimiter is missing", () => {
    const { summary, angles } = parseDeepDive("Just an analysis, no angles.");
    expect(summary).toBe("Just an analysis, no angles.");
    expect(angles).toEqual([]);
  });

  it("falls back to empty angles on malformed JSON without losing the summary", () => {
    const bad = `Analysis text.\n${ANGLES_DELIMITER}\n[{"title": broken`;
    const { summary, angles } = parseDeepDive(bad);
    expect(summary).toBe("Analysis text.");
    expect(angles).toEqual([]);
  });

  it("drops angle items missing required fields", () => {
    const partial = `A.\n${ANGLES_DELIMITER}\n[{"title":"ok","rationale":"r","first_move":"f"},{"title":"missing fields"}]`;
    expect(parseDeepDive(partial).angles).toHaveLength(1);
  });
});

describe("extractCitedSources", () => {
  it("collects and dedupes citation URLs from text blocks", () => {
    const content = [
      {
        type: "text",
        text: "a",
        citations: [
          { type: "web_search_result_location", url: "https://x.com/1", title: "One" },
          { type: "web_search_result_location", url: "https://x.com/1", title: "One" },
        ],
      },
      {
        type: "text",
        text: "b",
        citations: [
          { type: "web_search_result_location", url: "https://x.com/2", title: "Two" },
        ],
      },
      { type: "server_tool_use", id: "t1", name: "web_search", input: {} },
    ];
    expect(extractCitedSources(content)).toEqual([
      { title: "One", url: "https://x.com/1" },
      { title: "Two", url: "https://x.com/2" },
    ]);
  });

  it("returns empty for content without citations", () => {
    expect(extractCitedSources([{ type: "text", text: "plain" }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/deepdive/parse.test.ts`
Expected: FAIL — cannot resolve `@/lib/deepdive/parse`.

- [ ] **Step 3: Write the implementation**

Create `lib/deepdive/parse.ts`:

```typescript
import type { Angle, DeepDiveSource } from "@/lib/types";
import { ANGLES_DELIMITER } from "@/lib/deepdive/prompt";

// Same defensive philosophy as the n8n payload node: never lose the summary
// over a formatting problem in the angles JSON.
export function parseDeepDive(text: string): {
  summary: string;
  angles: Angle[];
} {
  const idx = text.indexOf(ANGLES_DELIMITER);
  if (idx === -1) return { summary: text.trim(), angles: [] };

  const summary = text.slice(0, idx).trim();
  let anglesRaw = text.slice(idx + ANGLES_DELIMITER.length);

  // Strip accidental markdown fences.
  const start = anglesRaw.indexOf("[");
  const end = anglesRaw.lastIndexOf("]");
  if (start === -1 || end === -1) return { summary, angles: [] };
  anglesRaw = anglesRaw.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(anglesRaw);
  } catch {
    return { summary, angles: [] };
  }
  if (!Array.isArray(parsed)) return { summary, angles: [] };

  const angles = parsed.filter(
    (a): a is Angle =>
      typeof a === "object" &&
      a !== null &&
      typeof (a as Angle).title === "string" &&
      typeof (a as Angle).rationale === "string" &&
      typeof (a as Angle).first_move === "string",
  );
  return { summary, angles };
}

type CitationLike = { url?: unknown; title?: unknown };
type BlockLike = { type?: unknown; citations?: unknown };

export function extractCitedSources(content: unknown[]): DeepDiveSource[] {
  const byUrl = new Map<string, DeepDiveSource>();
  for (const block of content) {
    const b = block as BlockLike;
    if (b.type !== "text" || !Array.isArray(b.citations)) continue;
    for (const c of b.citations as CitationLike[]) {
      if (typeof c.url === "string" && !byUrl.has(c.url)) {
        byUrl.set(c.url, {
          url: c.url,
          title: typeof c.title === "string" ? c.title : c.url,
        });
      }
    }
  }
  return Array.from(byUrl.values());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/deepdive/parse.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add lib/deepdive/parse.ts lib/deepdive/parse.test.ts
git commit -m "feat: add deep-dive response parsing with defensive fallbacks"
```

---

### Task 6: Anthropic client + deep-dive route

**Files:**
- Create: `lib/anthropic.ts`
- Create: `app/api/entries/[id]/deep-dive/route.ts`
- Test: `app/api/entries/[id]/deep-dive/route.test.ts`

**Interfaces:**
- Consumes: `hasValidSession` (Task 3), queries (Task 2), prompt/parse (Tasks 4-5).
- Produces:
  - `getAnthropicClient(): Anthropic` from `@/lib/anthropic` (singleton, throws a clear error if `ANTHROPIC_API_KEY` unset).
  - `POST /api/entries/[id]/deep-dive` → 401 no session; 404 unknown entry; JSON `{ cached: true, deepDive }` when cached; otherwise `text/plain` stream of the generation, saved via `upsertDeepDive` on completion.
  - `DELETE /api/entries/[id]/deep-dive` → 401/404 same; deletes the cached row, returns `{ ok: true }`.

- [ ] **Step 1: Install the SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Create the client singleton**

Create `lib/anthropic.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY must be set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const DIGEST_MODEL = "claude-sonnet-5";

export const WEB_SEARCH_TOOL = {
  type: "web_search_20260209" as const,
  name: "web_search" as const,
  max_uses: 3,
};
```

- [ ] **Step 3: Write the failing auth tests**

Create `app/api/entries/[id]/deep-dive/route.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, POST } from "./route";

function req(method: string): NextRequest {
  return new NextRequest("http://localhost/api/entries/e1/deep-dive", {
    method,
  });
}
const ctx = { params: Promise.resolve({ id: "e1" }) };

describe("deep-dive route auth", () => {
  beforeEach(() => {
    process.env.COOKIE_SECRET = "test-secret";
  });

  it("POST rejects requests without a session", async () => {
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(401);
  });

  it("DELETE rejects requests without a session", async () => {
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run app/api/entries/[id]/deep-dive/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 5: Write the route**

Create `app/api/entries/[id]/deep-dive/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { hasValidSession } from "@/lib/api-auth";
import {
  deleteDeepDive,
  getDeepDive,
  getDigestById,
  getEntriesWithSources,
  getEntryWithSourcesById,
  getProfileBio,
  upsertDeepDive,
} from "@/lib/queries";
import { buildDeepDivePrompt } from "@/lib/deepdive/prompt";
import { extractCitedSources, parseDeepDive } from "@/lib/deepdive/parse";
import {
  DIGEST_MODEL,
  getAnthropicClient,
  WEB_SEARCH_TOOL,
} from "@/lib/anthropic";

const MAX_CONTINUATIONS = 3;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const entry = await getEntryWithSourcesById(id);
  if (!entry) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }

  const cached = await getDeepDive(id);
  if (cached) {
    return NextResponse.json({ cached: true, deepDive: cached });
  }

  const [digest, dayEntries, bio] = await Promise.all([
    getDigestById(entry.digest_id),
    getEntriesWithSources(entry.digest_id),
    getProfileBio(),
  ]);
  const { system, user } = buildDeepDivePrompt({
    entry,
    dayEntries,
    bio,
    date: digest?.digest_date ?? "unknown",
  });

  const client = getAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = "";
        const allContent: Anthropic.ContentBlock[] = [];
        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: user },
        ];

        for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
          const msgStream = client.messages.stream({
            model: DIGEST_MODEL,
            max_tokens: 8000,
            system,
            tools: [WEB_SEARCH_TOOL],
            messages,
          });
          msgStream.on("text", (delta) => {
            fullText += delta;
            controller.enqueue(encoder.encode(delta));
          });
          const final = await msgStream.finalMessage();
          allContent.push(...final.content);
          // Server-side web search hit its iteration limit; resume.
          if (final.stop_reason === "pause_turn" && i < MAX_CONTINUATIONS) {
            messages.push({ role: "assistant", content: final.content });
            continue;
          }
          break;
        }

        const { summary, angles } = parseDeepDive(fullText);
        await upsertDeepDive({
          entry_id: id,
          summary,
          angles,
          sources_used: extractCitedSources(allContent),
          model: DIGEST_MODEL,
        });
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const entry = await getEntryWithSourcesById(id);
  if (!entry) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }
  await deleteDeepDive(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run app/api/entries/[id]/deep-dive/route.test.ts`
Expected: 2 passed. (The 401 path returns before any DB or Anthropic call, so no mocking is needed.)

- [ ] **Step 7: Commit**

```bash
git add lib/anthropic.ts "app/api/entries/[id]/deep-dive/route.ts" "app/api/entries/[id]/deep-dive/route.test.ts" package.json package-lock.json
git commit -m "feat: add deep-dive generation route with streaming and caching"
```

---

### Task 7: Chat route

**Files:**
- Create: `app/api/entries/[id]/chat/route.ts`
- Test: `app/api/entries/[id]/chat/route.test.ts`

**Interfaces:**
- Consumes: `hasValidSession`, queries, `buildChatSystemPrompt`, `getAnthropicClient`, `DIGEST_MODEL`, `WEB_SEARCH_TOOL`.
- Produces: `POST /api/entries/[id]/chat`. Body `{ messages: [{ role: "user"|"assistant", content: string }] }` (zod-validated, last message must be from the user). 401 no session; 404 unknown entry; 409 if no deep dive exists yet (chat depends on it); 422 invalid body. Success: `text/plain` stream of the assistant reply. History truncated to the last 20 messages.

- [ ] **Step 1: Write the failing tests**

Create `app/api/entries/[id]/chat/route.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth";
import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "e1" }) };

function req(body: unknown, cookie?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", `digest_session=${cookie}`);
  return new NextRequest("http://localhost/api/entries/e1/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("chat route", () => {
  beforeEach(() => {
    process.env.COOKIE_SECRET = "test-secret";
  });

  it("rejects requests without a session", async () => {
    const res = await POST(req({ messages: [] }), ctx);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body with 422 before touching the DB", async () => {
    const token = await createSessionToken("test-secret");
    const res = await POST(req({ messages: [{ role: "bogus" }] }, token), ctx);
    expect(res.status).toBe(422);
  });

  it("rejects when the last message is not from the user", async () => {
    const token = await createSessionToken("test-secret");
    const res = await POST(
      req({ messages: [{ role: "assistant", content: "hi" }] }, token),
      ctx,
    );
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/entries/[id]/chat/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the route**

Create `app/api/entries/[id]/chat/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasValidSession } from "@/lib/api-auth";
import {
  getDeepDive,
  getDigestById,
  getEntriesWithSources,
  getEntryWithSourcesById,
  getProfileBio,
} from "@/lib/queries";
import { buildChatSystemPrompt } from "@/lib/deepdive/prompt";
import {
  DIGEST_MODEL,
  getAnthropicClient,
  WEB_SEARCH_TOOL,
} from "@/lib/anthropic";

const MAX_HISTORY = 20;

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const parsed = chatBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const history = parsed.data.messages.slice(-MAX_HISTORY);
  if (history[history.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "last message must be from the user" },
      { status: 422 },
    );
  }

  const { id } = await ctx.params;
  const entry = await getEntryWithSourcesById(id);
  if (!entry) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }
  const deepDive = await getDeepDive(id);
  if (!deepDive) {
    return NextResponse.json(
      { error: "deep dive not generated yet" },
      { status: 409 },
    );
  }

  const [digest, dayEntries, bio] = await Promise.all([
    getDigestById(entry.digest_id),
    getEntriesWithSources(entry.digest_id),
    getProfileBio(),
  ]);
  const system = buildChatSystemPrompt({
    entry,
    dayEntries,
    deepDiveSummary: deepDive.summary,
    bio,
    date: digest?.digest_date ?? "unknown",
  });

  const client = getAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const msgStream = client.messages.stream({
          model: DIGEST_MODEL,
          max_tokens: 2000,
          system,
          tools: [WEB_SEARCH_TOOL],
          messages: history,
        });
        msgStream.on("text", (delta) => {
          controller.enqueue(encoder.encode(delta));
        });
        await msgStream.finalMessage();
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/api/entries/[id]/chat/route.test.ts`
Expected: 3 passed. (401 and 422 paths return before any DB/Anthropic call.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass, including pre-existing ones.

- [ ] **Step 6: Commit**

```bash
git add "app/api/entries/[id]/chat/route.ts" "app/api/entries/[id]/chat/route.test.ts"
git commit -m "feat: add entry-scoped streaming chat route"
```

---

### Task 8: Entry detail page + deep-dive UI

**Files:**
- Create: `app/(main)/entry/[id]/page.tsx`
- Create: `components/markdown.tsx`
- Create: `components/deep-dive-section.tsx`
- Create: `components/angle-card.tsx`
- Create: `components/regenerate-button.tsx`

**Interfaces:**
- Consumes: queries (Task 2), types, existing `SourceLink`, `Icon`, `getIndustryColor`/`getIndustryTextColor`, `getCategoryIcon`.
- Produces:
  - `/entry/[id]` server-component page (404 on bad/unknown id).
  - `<Markdown>{string}</Markdown>` — styled react-markdown wrapper (reused by Task 9's chat).
  - `<DeepDiveSection entryId>` — client; auto-starts generation, streams text, `router.refresh()` on completion, error state with retry.
  - `<AngleCard angle>` — presentational card.
  - `<RegenerateButton entryId>` — client; DELETE + refresh.

- [ ] **Step 1: Install react-markdown**

```bash
npm install react-markdown
```

- [ ] **Step 2: Create the Markdown component**

Create `components/markdown.tsx`:

```tsx
import ReactMarkdown from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        h2: (props) => (
          <h2
            className="mb-2 mt-6 font-mono text-xs uppercase tracking-[0.15em] text-text-muted first:mt-0"
            {...props}
          />
        ),
        h3: (props) => (
          <h3 className="mb-2 mt-4 font-body font-semibold" {...props} />
        ),
        p: (props) => (
          <p className="mb-3 leading-relaxed text-text" {...props} />
        ),
        ul: (props) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-text" {...props} />
        ),
        ol: (props) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-text" {...props} />
        ),
        a: (props) => (
          <a
            className="text-accent underline underline-offset-2 hover:no-underline"
            target="_blank"
            rel="noreferrer"
            {...props}
          />
        ),
        strong: (props) => <strong className="font-semibold" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
```

- [ ] **Step 3: Create AngleCard**

Create `components/angle-card.tsx`:

```tsx
import type { Angle } from "@/lib/types";
import { Icon } from "@/components/icons";

export function AngleCard({ angle, index }: { angle: Angle; index: number }) {
  return (
    <article className="relative overflow-hidden rounded border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-accent">
          Angle {index + 1}
        </span>
        <Icon name="bolt" className="h-3.5 w-3.5 flex-none text-accent" />
      </div>
      <h3 className="font-body font-semibold leading-snug">{angle.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">
        {angle.rationale}
      </p>
      <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-text-muted">
          First move:{" "}
        </span>
        {angle.first_move}
      </p>
    </article>
  );
}
```

Note: `icons.tsx` already exports a `bolt` icon (used by the spotlight card). If the `Icon` component's prop types differ, match the existing usage in `components/entry-card.tsx`.

- [ ] **Step 4: Create RegenerateButton**

Create `components/regenerate-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegenerateButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/entries/${entryId}/deep-dive`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={regenerate}
      disabled={busy}
      className="rounded border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:opacity-50"
    >
      {busy ? "Clearing…" : "Regenerate"}
    </button>
  );
}
```

- [ ] **Step 5: Create DeepDiveSection**

Create `components/deep-dive-section.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/markdown";

export function DeepDiveSection({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"generating" | "error">("generating");
  const started = useRef(false);

  async function run() {
    setStatus("generating");
    setText("");
    try {
      const res = await fetch(`/api/entries/${entryId}/deep-dive`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Cache hit race: another tab generated it first.
      if (res.headers.get("content-type")?.includes("application/json")) {
        router.refresh();
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((t) => t + decoder.decode(value, { stream: true }));
      }
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <div className="rounded border border-border bg-surface p-5">
        <p className="text-sm text-text-muted">
          The deep dive failed to generate.
        </p>
        <button
          onClick={run}
          className="mt-3 rounded bg-accent px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wide text-accent-contrast transition-opacity hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-surface p-5">
      <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-accent">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
        Generating deep dive — searching the web and writing…
      </p>
      {text ? (
        <Markdown>{text}</Markdown>
      ) : (
        <p className="text-sm text-text-muted">Warming up…</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create the detail page**

Create `app/(main)/entry/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getActiveIndustries,
  getCategories,
  getDeepDive,
  getDigestById,
  getEntryWithSourcesById,
} from "@/lib/queries";
import { SourceLink } from "@/components/source-link";
import { Icon } from "@/components/icons";
import { Markdown } from "@/components/markdown";
import { AngleCard } from "@/components/angle-card";
import { DeepDiveSection } from "@/components/deep-dive-section";
import { RegenerateButton } from "@/components/regenerate-button";
import { EntryChat } from "@/components/entry-chat";
import { getCategoryIcon } from "@/lib/category-icons";
import { getIndustryColor, getIndustryTextColor } from "@/lib/industry-colors";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const entry = await getEntryWithSourcesById(id);
  if (!entry) notFound();

  const [digest, deepDive, categories, industries] = await Promise.all([
    getDigestById(entry.digest_id),
    getDeepDive(id),
    getCategories(),
    getActiveIndustries(),
  ]);
  const category = categories.find((c) => c.slug === entry.category_slug);
  const industry = entry.industry_slug
    ? industries.find((i) => i.slug === entry.industry_slug)
    : undefined;
  const date = digest?.digest_date;

  return (
    <main>
      <header className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2.5 font-mono text-xs uppercase tracking-wide text-text-muted">
          <Icon
            name={getCategoryIcon(entry.category_slug)}
            className="flex-none text-accent"
          />
          <span>{category?.name ?? entry.category_slug}</span>
          {industry && (
            <Link
              href={`/industry/${industry.slug}${date ? `?date=${date}` : ""}`}
              className="rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
              style={{
                background: getIndustryColor(industry.slug),
                color: getIndustryTextColor(industry.slug),
              }}
            >
              {industry.name}
            </Link>
          )}
          {date && (
            <Link
              href={`/d/${date}`}
              className="ml-auto text-accent underline underline-offset-2 hover:no-underline"
            >
              ← {date} digest
            </Link>
          )}
        </div>
        <h1 className="max-w-[34ch] font-body text-2xl font-semibold leading-tight sm:text-3xl">
          {entry.title}
        </h1>
        <p className="mt-3 max-w-[58ch] leading-relaxed text-text-muted">
          {entry.body}
        </p>
        {entry.sources.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {entry.sources.map((s) => (
              <SourceLink key={s.id} item={s} />
            ))}
          </div>
        )}
      </header>

      <section className="mb-10">
        <h2 className="mb-4 flex items-center justify-between gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted after:hidden">
          <span className="flex items-center gap-2">
            <Icon name="doc" className="flex-none text-accent" />
            The Deep Dive
          </span>
          {deepDive && <RegenerateButton entryId={id} />}
        </h2>
        {deepDive ? (
          <div className="rounded border border-border bg-surface p-5">
            <Markdown>{deepDive.summary}</Markdown>
          </div>
        ) : (
          <DeepDiveSection entryId={id} />
        )}
      </section>

      {deepDive && deepDive.angles.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
            <Icon name="bolt" className="flex-none text-accent" />
            Angles
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {deepDive.angles.map((angle, i) => (
              <AngleCard key={i} angle={angle} index={i} />
            ))}
          </div>
        </section>
      )}

      {deepDive && deepDive.sources_used.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
            Sources consulted
          </h2>
          <ul className="space-y-1">
            {deepDive.sources_used.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-text-muted underline underline-offset-2 hover:text-text"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] text-text-muted">
          <Icon name="chat" className="flex-none text-accent" />
          Ask about this story
        </h2>
        <EntryChat entryId={id} enabled={!!deepDive} />
      </section>
    </main>
  );
}
```

Note: `EntryChat` is created in Task 9. To keep this task independently compilable, create a placeholder now — Task 9 replaces it entirely:

Create `components/entry-chat.tsx` (placeholder):

```tsx
"use client";

export function EntryChat({
  entryId,
  enabled,
}: {
  entryId: string;
  enabled: boolean;
}) {
  void entryId;
  return (
    <p className="text-sm text-text-muted">
      {enabled ? "Chat coming in the next task." : "Chat unlocks once the deep dive finishes."}
    </p>
  );
}
```

Also check `lib/category-icons.ts` and `components/icons.tsx` for the exact exported names (`getCategoryIcon`, `Icon`, icon names `doc`/`bolt`/`chat` are used by existing pages — reuse whatever exists; adjust names to match if they differ).

- [ ] **Step 7: Verify compile + tests + dev-render**

Run: `npx tsc --noEmit && npm test`
Expected: clean compile, all tests pass.

Run: `npm run build`
Expected: build succeeds (catches server/client component boundary mistakes).

- [ ] **Step 8: Commit**

```bash
git add "app/(main)/entry/[id]/page.tsx" components/markdown.tsx components/angle-card.tsx components/deep-dive-section.tsx components/regenerate-button.tsx components/entry-chat.tsx package.json package-lock.json
git commit -m "feat: add entry detail page with streamed deep dive and angles"
```

---

### Task 9: Chat UI

**Files:**
- Modify: `components/entry-chat.tsx` (replace the Task 8 placeholder entirely)

**Interfaces:**
- Consumes: `POST /api/entries/[id]/chat` (Task 7), `Markdown` (Task 8).
- Produces: `<EntryChat entryId enabled>` — ephemeral React-state chat with streaming replies, disabled state, error bubble with retry.

- [ ] **Step 1: Replace the placeholder**

Replace the full contents of `components/entry-chat.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function EntryChat({
  entryId,
  enabled,
}: {
  entryId: string;
  enabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const lastSent = useRef<ChatMessage[]>([]);

  async function send(history: ChatMessage[]) {
    setBusy(true);
    setError(false);
    lastSent.current = history;
    setMessages([...history, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(`/api/entries/${entryId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const current = reply;
        setMessages([...history, { role: "assistant", content: current }]);
      }
      if (!reply) throw new Error("empty reply");
    } catch {
      setMessages(history);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setInput("");
    send([...messages, { role: "user", content: trimmed }]);
  }

  if (!enabled) {
    return (
      <p className="rounded border border-dashed border-border p-4 text-sm text-text-muted">
        Chat unlocks once the deep dive finishes generating.
      </p>
    );
  }

  return (
    <div className="rounded border border-border bg-surface">
      <div className="max-h-[28rem] space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-text-muted">
            Ask anything about this story — implications, players, what&rsquo;s
            happened since. Conversation resets when you leave the page.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="ml-auto max-w-[85%] rounded bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              {m.content}
            </p>
          ) : (
            <div key={i} className="max-w-[95%] text-sm">
              {m.content ? (
                <Markdown>{m.content}</Markdown>
              ) : (
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              )}
            </div>
          ),
        )}
        {error && (
          <div className="rounded border border-border p-3 text-sm text-text-muted">
            That message failed.{" "}
            <button
              onClick={() => send(lastSent.current)}
              className="text-accent underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "Thinking…" : "Ask about this story…"}
          disabled={busy}
          className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-sm text-text outline-none placeholder:text-text-muted focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/entry-chat.tsx
git commit -m "feat: add ephemeral entry-scoped chat UI with streaming"
```

---

### Task 10: Clickable entry cards + masthead settings link

**Files:**
- Modify: `components/entry-card.tsx`
- Modify: `components/masthead.tsx`

**Interfaces:**
- Consumes: existing `EntryCard` props (`entry.id` is already available); `/entry/[id]` page.
- Produces: every card title links to `/entry/[id]`; masthead links to `/settings`.

- [ ] **Step 1: Link the spotlight title**

In `components/entry-card.tsx`, wrap the spotlight `<h1>` contents in a Link. Replace:

```tsx
        <h1 className="drop-cap relative max-w-[34ch] font-body text-2xl font-semibold leading-tight sm:text-3xl">
          {entry.title}
        </h1>
```

with:

```tsx
        <h1 className="drop-cap relative max-w-[34ch] font-body text-2xl font-semibold leading-tight sm:text-3xl">
          <Link
            href={`/entry/${entry.id}`}
            className="transition-colors hover:text-accent"
          >
            {entry.title}
          </Link>
        </h1>
```

- [ ] **Step 2: Link the regular/feature title**

In the same file, replace:

```tsx
      <h3 className={`font-body font-semibold leading-snug ${feature ? "text-xl" : "text-base"}`}>
        {entry.title}
      </h3>
```

with:

```tsx
      <h3 className={`font-body font-semibold leading-snug ${feature ? "text-xl" : "text-base"}`}>
        <Link
          href={`/entry/${entry.id}`}
          className="transition-colors hover:text-accent"
        >
          {entry.title}
        </Link>
      </h3>
```

(`Link` is already imported in this file.)

- [ ] **Step 3: Add the settings link to the masthead**

In `components/masthead.tsx`, inside the `<div className="flex items-center gap-3">` that holds the date, add before the date `<span>`:

```tsx
          <Link
            href="/settings"
            className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text"
          >
            Settings
          </Link>
```

- [ ] **Step 4: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean. (The `/settings` page 404s until Task 11 — acceptable within the branch.)

- [ ] **Step 5: Commit**

```bash
git add components/entry-card.tsx components/masthead.tsx
git commit -m "feat: link entry cards to detail pages and add settings link"
```

---

### Task 11: Settings page

**Files:**
- Create: `app/(main)/settings/page.tsx`
- Create: `app/(main)/settings/actions.ts`

**Interfaces:**
- Consumes: `getProfileBio`, `saveProfileBio` (Task 2).
- Produces: `/settings` page with a bio textarea + save via server action (redirect with `?saved=1` like the login page's `?error=1` pattern).

- [ ] **Step 1: Create the server action**

Create `app/(main)/settings/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { saveProfileBio } from "@/lib/queries";

export async function saveBio(formData: FormData) {
  const bio = String(formData.get("bio") ?? "");
  await saveProfileBio(bio);
  redirect("/settings?saved=1");
}
```

- [ ] **Step 2: Create the page**

Create `app/(main)/settings/page.tsx`:

```tsx
import { getProfileBio } from "@/lib/queries";
import { saveBio } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const [{ saved }, bio] = await Promise.all([searchParams, getProfileBio()]);

  return (
    <main>
      <h1 className="mb-2 font-display text-3xl font-extrabold uppercase tracking-tight">
        Settings
      </h1>
      <p className="mb-8 max-w-[58ch] text-sm text-text-muted">
        Your profile is included in every deep dive and chat so business angles
        are aimed at you — interests, skills, what kinds of opportunities
        you&rsquo;re hunting. Leave it empty for generic angles.
      </p>

      <form action={saveBio} className="max-w-2xl space-y-4">
        <label
          htmlFor="bio"
          className="block font-mono text-xs uppercase tracking-[0.15em] text-text-muted"
        >
          About me
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={8}
          defaultValue={bio}
          placeholder="e.g. USC student studying business, interested in logistics and energy startups, looking for internship-scale opportunities and small ventures I could start with a technical co-founder…"
          className="w-full rounded border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-text outline-none placeholder:text-text-muted focus:border-accent"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-accent-contrast transition-opacity hover:opacity-90"
          >
            Save
          </button>
          {saved && (
            <span className="font-mono text-xs uppercase tracking-wide text-text-muted">
              Saved.
            </span>
          )}
        </div>
      </form>

      <p className="mt-6 max-w-2xl text-xs text-text-muted">
        Existing deep dives keep their old angles — use the Regenerate button
        on an entry to re-run it with your updated profile.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Verify compile + build + full tests**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(main)/settings/page.tsx" "app/(main)/settings/actions.ts"
git commit -m "feat: add settings page for profile bio"
```

---

### Task 12: Final verification + handoff

**Files:** none created — verification only.

- [ ] **Step 1: Full automated pass**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. Fix anything that doesn't before proceeding.

- [ ] **Step 2: Confirm env documentation**

Verify `.env.local` has `ANTHROPIC_API_KEY=` (ask the human to add their key — the same one n8n uses — if absent). Do NOT print or commit the value.

- [ ] **Step 3: Produce the manual live-verification checklist**

Present this checklist to Rayyan (he runs live verification himself — automated tests never call the real API):

```
Pre-req: run supabase/migration-002-deep-dives.sql in the Supabase SQL editor,
and add ANTHROPIC_API_KEY to .env.local (and to Vercel before deploying).

Local (npm run dev):
1. Home feed: entry titles are links; click one → detail page opens instantly
   with title/body/sources.
2. First visit: "Generating deep dive" appears, text streams in over ~10-20s,
   then the page swaps to the formatted deep dive + angle cards + sources
   consulted.
3. Refresh the page → deep dive renders instantly (cached, no generation).
4. Chat: ask "what's the most realistic angle here for me?" → reply streams
   in and references your profile if set.
5. Chat is disabled (with a hint) while a deep dive is generating.
6. /settings: save a bio → Saved confirmation; hit Regenerate on an entry →
   deep dive re-generates and the angles reflect the bio.
7. Visit /entry/not-a-uuid and /entry/00000000-0000-0000-0000-000000000000 →
   both 404.
8. Log out (clear the digest_session cookie) and POST to
   /api/entries/<id>/chat with curl → 401.

Report back what worked / what didn't.
```

- [ ] **Step 4: Commit any final fixes and stop**

Do not merge to main — hand off per superpowers:finishing-a-development-branch once Rayyan's live verification passes.

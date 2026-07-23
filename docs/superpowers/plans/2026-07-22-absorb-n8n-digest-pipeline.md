# Absorb n8n Digest Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the daily fetch → organize → ingest pipeline currently run by the external n8n workflow (`n8n/industry-digest-workflow.json`) into this Next.js app, so an external cron poller hits two app routes instead of n8n orchestrating third-party HTTP calls.

**Architecture:** Two-phase design driven by an external poller (user has their own cron-job.org-style service, on Vercel Hobby's 60s function limit — no long in-process wait is possible). `POST /api/cron/digest/start` kicks off the Reddit scrape on Apify and returns immediately. `POST /api/cron/digest/finish`, polled every 1-2 minutes afterward, checks whether the Apify run has finished; once ready it fetches BBC RSS + Yahoo Finance data (both fast, keyless), shapes/caps everything into `IngestItem[]`, has Claude synthesize the six-category `IngestEntry[]` (porting the exact prompt from the n8n "Build Synthesis Prompt" node), and writes the digest through the same validation/transform path `/api/ingest` already uses. Every fetch/shape/prompt step is a direct, verbatim port of one n8n Code node — same caps, same regexes, same prompt text — so the produced digest is behaviorally identical to what the n8n workflow produces today.

**Tech Stack:** Next.js route handlers, `@anthropic-ai/sdk` (already a dependency), native `fetch` for Apify/BBC/Yahoo, Vitest for tests.

## Global Constraints

- Reuse `IngestItem` / `IngestEntry` / `ingestPayloadSchema` from `lib/ingest/schema.ts` verbatim — do not redefine these shapes.
- Every new external-data shaping function must be a pure function (input data in, `IngestItem[]`/`IngestEntry[]` out) with the network call in a thin wrapper around it, so behavior is unit-testable without mocking `fetch` for the interesting logic — this matches how `lib/deepdive/prompt.ts` and `lib/ingest/transform.ts` are already structured in this codebase.
- Route tests stay cheap: mirror the existing pattern in `app/api/entries/[id]/deep-dive/route.test.ts` (auth-rejection only, no live network/DB calls). Do not add integration tests that hit real Apify/Anthropic/Supabase — the user runs live verification manually.
- New env vars: `APIFY_API_TOKEN`, `CRON_SECRET`. Do not remove `INGEST_TOKEN` — `/api/ingest` stays live for `scripts/seed.ts` and manual backfills.
- Category slugs (`big_event`, `world_news`, `community_sentiment`, `industry_events`, `finance`, `opportunities`) and industry slugs are exactly what's in `n8n/industry-digest-workflow.json`'s Config node — copy verbatim, do not invent new ones.

---

### Task 1: Static pipeline config

**Files:**
- Create: `lib/digest/config.ts`

**Interfaces:**
- Produces: `IndustryConfig { slug: string; name: string; subreddits: string[] }`, `INDUSTRIES: IndustryConfig[]`, `NewsFeedConfig { url: string; label: string }`, `NEWS_FEEDS: NewsFeedConfig[]`, `MarketTickerConfig { symbol: string; label: string }`, `MARKET_TICKERS: MarketTickerConfig[]`, `CATEGORY_SLUGS: readonly string[]`

This is static data ported verbatim from the n8n "Config" node — no behavior to test. The codebase's existing static-mapping files (`lib/industry-colors.ts`, `lib/category-icons.ts`) have no test files either; follow that precedent.

- [ ] **Step 1: Create the config file**

```ts
// lib/digest/config.ts
export interface IndustryConfig {
  slug: string;
  name: string;
  subreddits: string[];
}

export const INDUSTRIES: IndustryConfig[] = [
  { slug: "sports-management", name: "Sports Management", subreddits: ["SportsBusiness"] },
  { slug: "media", name: "Media", subreddits: ["mediaindustry"] },
  { slug: "manufacturing", name: "Manufacturing", subreddits: ["manufacturing"] },
  { slug: "consulting", name: "Consulting", subreddits: ["consulting"] },
  { slug: "contracting", name: "Contracting", subreddits: ["Construction"] },
  { slug: "brick-and-mortar", name: "Brick & Mortar", subreddits: ["retail"] },
  { slug: "energy", name: "Energy", subreddits: ["energy"] },
  { slug: "logistics", name: "Logistics", subreddits: ["logistics"] },
  { slug: "real-estate", name: "Real Estate", subreddits: ["CommercialRealEstate", "realestateinvesting"] },
  { slug: "agriculture", name: "Agriculture", subreddits: ["agriculture"] },
];

export interface NewsFeedConfig {
  url: string;
  label: string;
}

// No API key needed — BBC's public RSS feeds.
export const NEWS_FEEDS: NewsFeedConfig[] = [
  { url: "http://feeds.bbci.co.uk/news/world/rss.xml", label: "BBC World" },
  { url: "http://feeds.bbci.co.uk/news/business/rss.xml", label: "BBC Business" },
];

export interface MarketTickerConfig {
  symbol: string;
  label: string;
}

// No API key needed — Yahoo Finance's public chart endpoint.
export const MARKET_TICKERS: MarketTickerConfig[] = [
  { symbol: "SPY", label: "S&P 500 (SPY)" },
  { symbol: "XLE", label: "Energy sector (XLE)" },
  { symbol: "XLRE", label: "Real estate sector (XLRE)" },
  { symbol: "IYT", label: "Transports (IYT)" },
];

export const CATEGORY_SLUGS = [
  "big_event",
  "world_news",
  "community_sentiment",
  "industry_events",
  "finance",
  "opportunities",
] as const;
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `npx vitest run --passWithNoTests lib/digest/`
Expected: no failures (no test files exist yet in `lib/digest/` — this just proves the module has no syntax/import errors before later tasks build on it)

Note: `npx tsc --noEmit` on this repo currently reports 4 pre-existing errors in `lib/ingest/schema.test.ts` (unrelated to this plan, predates this work). Don't use a full-repo `tsc --noEmit` as a pass/fail gate in this plan — Vitest (which doesn't type-check) is the source of truth for whether tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/digest/config.ts
git commit -m "feat: add digest pipeline config (industries, feeds, tickers)"
```

---

### Task 2: News fetching (BBC RSS)

**Files:**
- Create: `lib/digest/news.ts`
- Test: `lib/digest/news.test.ts`

**Interfaces:**
- Consumes: `NewsFeedConfig` from `lib/digest/config.ts`; `IngestItem` type from `lib/ingest/schema.ts`
- Produces: `parseFeedItems(xml: string, label: string): IngestItem[]`, `fetchNewsItems(feeds: NewsFeedConfig[]): Promise<IngestItem[]>`

Ported verbatim from the n8n "Shape News Items" Code node (hand-rolled regex XML parsing, no library — matches the original exactly, capped at 5 items/feed).

- [ ] **Step 1: Write the failing test**

```ts
// lib/digest/news.test.ts
import { describe, it, expect } from "vitest";
import { parseFeedItems } from "@/lib/digest/news";

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss><channel>
<item>
  <title>First &amp; Best Story</title>
  <link>https://example.com/1</link>
  <description><![CDATA[<p>Some <b>html</b> summary that is fairly short.</p>]]></description>
</item>
<item>
  <title>Second Story</title>
  <link>https://example.com/2</link>
  <description>Plain text summary</description>
</item>
<item>
  <title>No Link Story</title>
  <description>Should be skipped</description>
</item>
</channel></rss>`;

describe("parseFeedItems", () => {
  it("extracts title, link, and stripped/decoded summary", () => {
    const items = parseFeedItems(SAMPLE_RSS, "BBC World");
    expect(items[0]).toEqual({
      key: "news-bbc-world-0",
      industry: null,
      source_type: "news",
      title: "First & Best Story",
      url: "https://example.com/1",
      summary: "Some html summary that is fairly short.",
      metadata: { source: "BBC World" },
      position: 0,
    });
  });

  it("assigns increasing positions and skips items missing title or link", () => {
    const items = parseFeedItems(SAMPLE_RSS, "BBC World");
    expect(items).toHaveLength(2);
    expect(items[1].position).toBe(1);
    expect(items[1].key).toBe("news-bbc-world-1");
  });

  it("caps at 5 items per feed", () => {
    const manyItems = Array.from(
      { length: 8 },
      (_, i) => `<item><title>Story ${i}</title><link>https://example.com/${i}</link></item>`,
    ).join("\n");
    const xml = `<rss><channel>${manyItems}</channel></rss>`;
    expect(parseFeedItems(xml, "BBC World")).toHaveLength(5);
  });

  it("slugifies the label for the key prefix", () => {
    const xml = `<rss><channel><item><title>T</title><link>https://example.com/x</link></item></channel></rss>`;
    expect(parseFeedItems(xml, "BBC Business")[0].key).toBe("news-bbc-business-0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/digest/news.test.ts`
Expected: FAIL — `Cannot find module '@/lib/digest/news'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/digest/news.ts
import type { IngestItem } from "@/lib/ingest/schema";
import type { NewsFeedConfig } from "@/lib/digest/config";

const MAX_PER_FEED = 5;

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!m) return "";
  let val = m[1];
  const cdata = val.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdata) val = cdata[1];
  return val
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function parseFeedItems(xml: string, label: string): IngestItem[] {
  const items: IngestItem[] = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];

  let position = 0;
  for (const block of blocks.slice(0, MAX_PER_FEED)) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    if (!title || !link) continue;

    items.push({
      key: `news-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${position}`,
      industry: null,
      source_type: "news",
      title,
      url: link,
      summary: description ? description.replace(/<[^>]+>/g, "").slice(0, 400) : null,
      metadata: { source: label },
      position: position++,
    });
  }

  return items;
}

export async function fetchNewsItems(feeds: NewsFeedConfig[]): Promise<IngestItem[]> {
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url);
        if (!res.ok) return [];
        const xml = await res.text();
        return parseFeedItems(xml, feed.label);
      } catch {
        return [];
      }
    }),
  );
  return results.flat();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/digest/news.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/digest/news.ts lib/digest/news.test.ts
git commit -m "feat: add BBC RSS news fetching, ported from n8n Shape News Items"
```

---

### Task 3: Market data fetching (Yahoo Finance)

**Files:**
- Create: `lib/digest/market.ts`
- Test: `lib/digest/market.test.ts`

**Interfaces:**
- Consumes: `MarketTickerConfig` from `lib/digest/config.ts`; `IngestItem` from `lib/ingest/schema.ts`
- Produces: `shapeMarketItem(ticker: MarketTickerConfig, data: YahooChartResponse, position: number): IngestItem | null`, `fetchMarketItems(tickers: MarketTickerConfig[]): Promise<IngestItem[]>`

Ported verbatim from the n8n "Shape Market Items" Code node.

- [ ] **Step 1: Write the failing test**

```ts
// lib/digest/market.test.ts
import { describe, it, expect } from "vitest";
import { shapeMarketItem } from "@/lib/digest/market";

const TICKER = { symbol: "SPY", label: "S&P 500 (SPY)" };

describe("shapeMarketItem", () => {
  it("computes a positive change percentage from previousClose", () => {
    const item = shapeMarketItem(
      TICKER,
      { chart: { result: [{ meta: { regularMarketPrice: 510, previousClose: 500 } }] } },
      2,
    );
    expect(item).toEqual({
      key: "market-SPY",
      industry: null,
      source_type: "market",
      title: "S&P 500 (SPY) +2.00%",
      url: null,
      summary: null,
      metadata: { ticker: "SPY", change_pct: 2, price: 510 },
      position: 2,
    });
  });

  it("computes a negative change percentage without a leading sign", () => {
    const item = shapeMarketItem(
      TICKER,
      { chart: { result: [{ meta: { regularMarketPrice: 490, previousClose: 500 } }] } },
      0,
    );
    expect(item?.title).toBe("S&P 500 (SPY) -2.00%");
  });

  it("falls back to chartPreviousClose when previousClose is absent", () => {
    const item = shapeMarketItem(
      TICKER,
      { chart: { result: [{ meta: { regularMarketPrice: 510, chartPreviousClose: 500 } }] } },
      0,
    );
    expect(item?.metadata?.change_pct).toBe(2);
  });

  it("returns null when the response has no result", () => {
    const item = shapeMarketItem(TICKER, { chart: { result: null } }, 0);
    expect(item).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/digest/market.test.ts`
Expected: FAIL — `Cannot find module '@/lib/digest/market'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/digest/market.ts
import type { IngestItem } from "@/lib/ingest/schema";
import type { MarketTickerConfig } from "@/lib/digest/config";

export interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
    }> | null;
  };
}

export function shapeMarketItem(
  ticker: MarketTickerConfig,
  data: YahooChartResponse,
  position: number,
): IngestItem | null {
  const meta = data.chart.result?.[0]?.meta;
  if (!meta) return null;

  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  const sign = changePct >= 0 ? "+" : "";

  return {
    key: `market-${ticker.symbol}`,
    industry: null,
    source_type: "market",
    title: `${ticker.label} ${sign}${changePct.toFixed(2)}%`,
    url: null,
    summary: null,
    metadata: { ticker: ticker.symbol, change_pct: Math.round(changePct * 100) / 100, price },
    position,
  };
}

export async function fetchMarketItems(tickers: MarketTickerConfig[]): Promise<IngestItem[]> {
  const items = await Promise.all(
    tickers.map(async (ticker, i) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.symbol}?interval=1d&range=5d`,
          { headers: { "User-Agent": "IndustryDigestBot/1.0 (personal use)" } },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as YahooChartResponse;
        return shapeMarketItem(ticker, data, i);
      } catch {
        return null;
      }
    }),
  );
  return items.filter((i): i is IngestItem => i !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/digest/market.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/digest/market.ts lib/digest/market.test.ts
git commit -m "feat: add Yahoo Finance market data fetching, ported from n8n Shape Market Items"
```

---

### Task 4: Reddit fetching (Apify)

**Files:**
- Create: `lib/digest/reddit.ts`
- Test: `lib/digest/reddit.test.ts`

**Interfaces:**
- Consumes: `IndustryConfig` from `lib/digest/config.ts`; `IngestItem` from `lib/ingest/schema.ts`
- Produces:
  - `buildRedditStartUrls(industries: IndustryConfig[]): { startUrls: { url: string }[]; subredditToIndustry: Record<string, string> }`
  - `shapeRedditItems(posts: Record<string, unknown>[], subredditToIndustry: Record<string, string>): IngestItem[]`
  - `startRedditScrape(startUrls: { url: string }[]): Promise<void>`
  - `type RedditRunCheck = { ready: false } | { ready: true; posts: Record<string, unknown>[] }`
  - `checkRedditRun(): Promise<RedditRunCheck>`

Ported from the n8n "Build Reddit Start URLs" and "Shape Reddit Items" Code nodes, plus the "Start Reddit Scrape" / "Fetch Reddit Dataset" HTTP nodes (Apify actor `trudax~reddit-scraper-lite`). `checkRedditRun` replaces n8n's fixed 3-minute wait node — it's polled by the `/finish` route instead of blocking.

- [ ] **Step 1: Write the failing test**

```ts
// lib/digest/reddit.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildRedditStartUrls, shapeRedditItems, startRedditScrape, checkRedditRun } from "@/lib/digest/reddit";
import type { IndustryConfig } from "@/lib/digest/config";

const INDUSTRIES: IndustryConfig[] = [
  { slug: "energy", name: "Energy", subreddits: ["energy"] },
  { slug: "real-estate", name: "Real Estate", subreddits: ["CommercialRealEstate", "realestateinvesting"] },
];

describe("buildRedditStartUrls", () => {
  it("builds one start URL per subreddit and a lowercase lookup map", () => {
    const { startUrls, subredditToIndustry } = buildRedditStartUrls(INDUSTRIES);
    expect(startUrls).toEqual([
      { url: "https://www.reddit.com/r/energy/top/?t=day" },
      { url: "https://www.reddit.com/r/CommercialRealEstate/top/?t=day" },
      { url: "https://www.reddit.com/r/realestateinvesting/top/?t=day" },
    ]);
    expect(subredditToIndustry).toEqual({
      energy: "energy",
      commercialrealestate: "real-estate",
      realestateinvesting: "real-estate",
    });
  });
});

describe("shapeRedditItems", () => {
  const map = { energy: "energy" };

  it("maps a post back to its industry via community name and builds the permalink URL", () => {
    const items = shapeRedditItems(
      [
        {
          dataType: "post",
          id: "abc123",
          title: "Storage buildout",
          communityName: "energy",
          permalink: "/r/energy/comments/abc123/storage_buildout/",
          body: "a".repeat(500),
          upVotes: 42,
          numberOfComments: 7,
        },
      ],
      map,
    );
    expect(items).toEqual([
      {
        key: "reddit-energy-abc123",
        industry: "energy",
        source_type: "reddit",
        title: "Storage buildout",
        url: "https://www.reddit.com/r/energy/comments/abc123/storage_buildout/",
        summary: "a".repeat(400),
        metadata: { subreddit: "energy", score: 42, comments: 7 },
        position: 0,
      },
    ]);
  });

  it("skips posts that don't map to a tracked industry", () => {
    const items = shapeRedditItems(
      [{ dataType: "post", title: "Unrelated", communityName: "somethingelse" }],
      map,
    );
    expect(items).toHaveLength(0);
  });

  it("skips non-post dataType entries and posts without a title", () => {
    const items = shapeRedditItems(
      [
        { dataType: "comment", title: "x", communityName: "energy" },
        { dataType: "post", communityName: "energy" },
      ],
      map,
    );
    expect(items).toHaveLength(0);
  });
});

describe("startRedditScrape / checkRedditRun", () => {
  const originalFetch = global.fetch;
  const originalToken = process.env.APIFY_API_TOKEN;

  beforeEach(() => {
    process.env.APIFY_API_TOKEN = "test-token";
  });
  afterEach(() => {
    global.fetch = originalFetch;
    process.env.APIFY_API_TOKEN = originalToken;
  });

  it("startRedditScrape POSTs the start URls to the Apify actor runs endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    global.fetch = fetchMock as unknown as typeof fetch;

    await startRedditScrape([{ url: "https://www.reddit.com/r/energy/top/?t=day" }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://api.apify.com/v2/acts/trudax~reddit-scraper-lite/runs?token=test-token",
    );
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      startUrls: [{ url: "https://www.reddit.com/r/energy/top/?t=day" }],
      maxItems: 100,
      skipComments: true,
      postsPerPage: 50,
    });
  });

  it("checkRedditRun returns not-ready when no SUCCEEDED run exists yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => "" });
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await checkRedditRun()).toEqual({ ready: false });
  });

  it("checkRedditRun fetches the dataset once a SUCCEEDED run is found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ title: "a post" }] });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await checkRedditRun();
    expect(result).toEqual({ ready: true, posts: [{ title: "a post" }] });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.apify.com/v2/acts/trudax~reddit-scraper-lite/runs/last/dataset/items?limit=150&token=test-token",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/digest/reddit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/digest/reddit'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/digest/reddit.ts
import type { IngestItem } from "@/lib/ingest/schema";
import type { IndustryConfig } from "@/lib/digest/config";

const ACTOR_ID = "trudax~reddit-scraper-lite";
const APIFY_BASE = "https://api.apify.com/v2";

function apifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN must be set");
  return token;
}

export function buildRedditStartUrls(
  industries: IndustryConfig[],
): { startUrls: { url: string }[]; subredditToIndustry: Record<string, string> } {
  const startUrls: { url: string }[] = [];
  const subredditToIndustry: Record<string, string> = {};

  for (const ind of industries) {
    for (const sub of ind.subreddits) {
      // t=day matches this pipeline's daily cadence.
      startUrls.push({ url: `https://www.reddit.com/r/${sub}/top/?t=day` });
      subredditToIndustry[sub.toLowerCase()] = ind.slug;
    }
  }

  return { startUrls, subredditToIndustry };
}

export async function startRedditScrape(startUrls: { url: string }[]): Promise<void> {
  const res = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${apifyToken()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ startUrls, maxItems: 100, skipComments: true, postsPerPage: 50 }),
  });
  if (!res.ok) {
    throw new Error(`Apify run start failed: ${res.status} ${await res.text()}`);
  }
}

export type RedditRunCheck = { ready: false } | { ready: true; posts: Record<string, unknown>[] };

export async function checkRedditRun(): Promise<RedditRunCheck> {
  const statusRes = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs/last?status=SUCCEEDED&token=${apifyToken()}`,
  );
  if (statusRes.status === 404) return { ready: false };
  if (!statusRes.ok) {
    throw new Error(`Apify run status check failed: ${statusRes.status} ${await statusRes.text()}`);
  }

  const datasetRes = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs/last/dataset/items?limit=150&token=${apifyToken()}`,
  );
  if (!datasetRes.ok) {
    throw new Error(`Apify dataset fetch failed: ${datasetRes.status} ${await datasetRes.text()}`);
  }
  const posts = (await datasetRes.json()) as Record<string, unknown>[];
  return { ready: true, posts };
}

function communitySlug(raw: unknown): string | null {
  if (!raw) return null;
  return String(raw).replace(/^\/?r\//i, "").trim().toLowerCase();
}

export function shapeRedditItems(
  posts: Record<string, unknown>[],
  subredditToIndustry: Record<string, string>,
): IngestItem[] {
  const items: IngestItem[] = [];
  let position = 0;

  for (const post of posts) {
    try {
      // trudax/reddit-scraper-lite's exact field names can shift between
      // actor versions — check a live run's dataset output if items come
      // through with missing titles/industries.
      if (post.dataType && post.dataType !== "post") continue;
      if (!post.title) continue;

      const slug = communitySlug(post.communityName ?? post.community ?? post.subreddit);
      const industry = slug ? subredditToIndustry[slug] : null;
      if (!industry) continue;

      const permalink = post.permalink as string | undefined;
      const fallbackUrl = post.url as string | undefined;
      const url = permalink ? `https://www.reddit.com${permalink}` : fallbackUrl ?? null;
      const body = post.body as string | undefined;

      items.push({
        key: `reddit-${industry}-${(post.id as string | undefined) ?? position}`,
        industry,
        source_type: "reddit",
        title: post.title as string,
        url: url ?? null,
        summary: body ? body.slice(0, 400) : null,
        metadata: {
          subreddit: slug,
          score: (post.upVotes as number | undefined) ?? (post.score as number | undefined) ?? null,
          comments:
            (post.numberOfComments as number | undefined) ?? (post.commentsCount as number | undefined) ?? null,
        },
        position: position++,
      });
    } catch {
      continue;
    }
  }

  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/digest/reddit.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/digest/reddit.ts lib/digest/reddit.test.ts
git commit -m "feat: add Apify-backed reddit fetching, ported from n8n reddit nodes"
```

---

### Task 5: Cap and renumber assembled items

**Files:**
- Create: `lib/digest/assemble.ts`
- Test: `lib/digest/assemble.test.ts`

**Interfaces:**
- Consumes: `IngestItem` from `lib/ingest/schema.ts`
- Produces: `assembleAndCap(all: IngestItem[]): IngestItem[]`

Ported verbatim from the n8n "Assemble Items & Cap" Code node: caps reddit at 4 items per industry, news at 10 total, leaves market uncapped, then renumbers `position` contiguously within each `(industry, source_type)` group.

- [ ] **Step 1: Write the failing test**

```ts
// lib/digest/assemble.test.ts
import { describe, it, expect } from "vitest";
import { assembleAndCap } from "@/lib/digest/assemble";
import type { IngestItem } from "@/lib/ingest/schema";

function redditItem(industry: string, n: number): IngestItem {
  return {
    key: `reddit-${industry}-${n}`,
    industry,
    source_type: "reddit",
    title: `r${n}`,
    position: n,
  };
}

function newsItem(n: number): IngestItem {
  return { key: `news-${n}`, industry: null, source_type: "news", title: `n${n}`, position: n };
}

describe("assembleAndCap", () => {
  it("caps reddit items at 4 per industry", () => {
    const items = Array.from({ length: 6 }, (_, i) => redditItem("energy", i));
    const result = assembleAndCap(items);
    expect(result).toHaveLength(4);
    expect(result.map((i) => i.key)).toEqual([
      "reddit-energy-0",
      "reddit-energy-1",
      "reddit-energy-2",
      "reddit-energy-3",
    ]);
  });

  it("caps reddit independently per industry", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => redditItem("energy", i)),
      ...Array.from({ length: 5 }, (_, i) => redditItem("logistics", i)),
    ];
    const result = assembleAndCap(items);
    expect(result.filter((i) => i.industry === "energy")).toHaveLength(4);
    expect(result.filter((i) => i.industry === "logistics")).toHaveLength(4);
  });

  it("caps news at 10 total across all feeds", () => {
    const items = Array.from({ length: 15 }, (_, i) => newsItem(i));
    expect(assembleAndCap(items)).toHaveLength(10);
  });

  it("leaves market items uncapped", () => {
    const items: IngestItem[] = Array.from({ length: 20 }, (_, i) => ({
      key: `market-${i}`,
      industry: null,
      source_type: "market",
      title: `m${i}`,
      position: i,
    }));
    expect(assembleAndCap(items)).toHaveLength(20);
  });

  it("renumbers positions contiguously within each (industry, source_type) group", () => {
    const items = [redditItem("energy", 5), redditItem("energy", 9), newsItem(3)];
    const result = assembleAndCap(items);
    const energyItems = result.filter((i) => i.source_type === "reddit");
    expect(energyItems.map((i) => i.position)).toEqual([0, 1]);
    expect(result.find((i) => i.source_type === "news")?.position).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/digest/assemble.test.ts`
Expected: FAIL — `Cannot find module '@/lib/digest/assemble'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/digest/assemble.ts
import type { IngestItem } from "@/lib/ingest/schema";

const REDDIT_PER_INDUSTRY = 4;
const NEWS_TOTAL = 10;

export function assembleAndCap(all: IngestItem[]): IngestItem[] {
  const reddit = all.filter((x) => x.source_type === "reddit");
  const news = all.filter((x) => x.source_type === "news");
  const market = all.filter((x) => x.source_type === "market");

  const cappedReddit: IngestItem[] = [];
  const seenPerIndustry: Record<string, number> = {};
  for (const item of reddit) {
    const key = item.industry ?? "";
    seenPerIndustry[key] = seenPerIndustry[key] ?? 0;
    if (seenPerIndustry[key] < REDDIT_PER_INDUSTRY) {
      cappedReddit.push(item);
      seenPerIndustry[key]++;
    }
  }

  const cappedNews = news.slice(0, NEWS_TOTAL);

  return renumber([...cappedReddit, ...cappedNews, ...market]);
}

function renumber(list: IngestItem[]): IngestItem[] {
  const counters: Record<string, number> = {};
  return list.map((item) => {
    const key = `${item.industry}::${item.source_type}`;
    counters[key] = counters[key] ?? 0;
    return { ...item, position: counters[key]++ };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/digest/assemble.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/digest/assemble.ts lib/digest/assemble.test.ts
git commit -m "feat: add item capping/renumbering, ported from n8n Assemble Items & Cap"
```

---

### Task 6: Synthesis prompt

**Files:**
- Create: `lib/digest/prompt.ts`
- Test: `lib/digest/prompt.test.ts`

**Interfaces:**
- Consumes: `IngestItem` from `lib/ingest/schema.ts`; `IndustryConfig`, `CATEGORY_SLUGS` from `lib/digest/config.ts`
- Produces: `buildSynthesisPrompt(args: { items: IngestItem[]; industries: IndustryConfig[]; date: string }): { system: string; user: string }`

Ported verbatim (byte-for-byte prompt text) from the n8n "Build Synthesis Prompt" Code node.

- [ ] **Step 1: Write the failing test**

```ts
// lib/digest/prompt.test.ts
import { describe, it, expect } from "vitest";
import { buildSynthesisPrompt } from "@/lib/digest/prompt";
import type { IngestItem } from "@/lib/ingest/schema";
import type { IndustryConfig } from "@/lib/digest/config";

const ITEMS: IngestItem[] = [
  { key: "k1", industry: "energy", source_type: "reddit", title: "Storage buildout", summary: "s", position: 0 },
];
const INDUSTRIES: IndustryConfig[] = [{ slug: "energy", name: "Energy", subreddits: ["energy"] }];

describe("buildSynthesisPrompt", () => {
  it("lists all category slugs in the system prompt", () => {
    const { system } = buildSynthesisPrompt({ items: ITEMS, industries: INDUSTRIES, date: "2026-07-22" });
    for (const slug of ["big_event", "world_news", "community_sentiment", "industry_events", "finance", "opportunities"]) {
      expect(system).toContain(slug);
    }
  });

  it("lists the given industry slugs in the system prompt", () => {
    const { system } = buildSynthesisPrompt({ items: ITEMS, industries: INDUSTRIES, date: "2026-07-22" });
    expect(system).toContain("energy");
  });

  it("instructs a JSON-array-only response with no markdown fences", () => {
    const { system } = buildSynthesisPrompt({ items: ITEMS, industries: INDUSTRIES, date: "2026-07-22" });
    expect(system).toMatch(/ONLY a JSON array/);
  });

  it("embeds the date and serialized items in the user prompt", () => {
    const { user } = buildSynthesisPrompt({ items: ITEMS, industries: INDUSTRIES, date: "2026-07-22" });
    expect(user).toContain("2026-07-22");
    expect(user).toContain('"key": "k1"');
    expect(user).toContain("Storage buildout");
  });

  it("omits url/position noise from the items given to the model", () => {
    const { user } = buildSynthesisPrompt({ items: ITEMS, industries: INDUSTRIES, date: "2026-07-22" });
    expect(user).not.toContain('"position"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/digest/prompt.test.ts`
Expected: FAIL — `Cannot find module '@/lib/digest/prompt'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/digest/prompt.ts
import type { IngestItem } from "@/lib/ingest/schema";
import { CATEGORY_SLUGS, type IndustryConfig } from "@/lib/digest/config";

export function buildSynthesisPrompt({
  items,
  industries,
  date,
}: {
  items: IngestItem[];
  industries: IndustryConfig[];
  date: string;
}): { system: string; user: string } {
  const industrySlugs = industries.map((i) => i.slug);
  const itemsForPrompt = items.map((it) => ({
    key: it.key,
    industry: it.industry,
    source_type: it.source_type,
    title: it.title,
    summary: it.summary,
    metadata: it.metadata,
  }));

  const system = `You are the daily synthesis step of a personal industry-intelligence digest.
You will be given a JSON array of raw items scraped today (reddit posts, news articles, market data),
each with a unique "key". Produce the curated "entries" array for the home feed.

Output rules (strict):
- Respond with ONLY a JSON array. No markdown fences, no prose, no explanation before or after.
- Each element: { "category": string, "industry": string|null, "title": string, "body": string, "position": integer, "source_refs": string[] }.
- "category" MUST be one of exactly: ${CATEGORY_SLUGS.join(", ")}.
- "industry", when set, MUST be one of exactly: ${industrySlugs.join(", ")}. Use null for items with no single industry (world news, broad market moves).
- "source_refs" MUST only contain "key" values from the provided items array. Never invent a key.
- "position" is zero-based order within its category section.

Category guidance:
- big_event: exactly ONE entry, the single most important story or opportunity across everything today.
- world_news: 1-3 entries, industry null, macro/global stories.
- community_sentiment: one entry per industry that had meaningful reddit discussion, synthesizing the overall mood/theme rather than restating one post; source_refs should usually cite multiple reddit items.
- industry_events: notable per-industry news (funding, deals, regulation, launches).
- finance: market-moving items; industry can be null or set if a move is industry-specific.
- opportunities: angles worth paying attention to — where the day's items suggest a business opening, an investment worth watching, or an industry/role gaining momentum. Ground every claim in the given items; do not speculate beyond them.

Keep each "body" to 2-4 sentences. Do not fabricate items or sources beyond what's provided.`;

  const user = `Today's date: ${date}

Raw items:
${JSON.stringify(itemsForPrompt, null, 2)}

Produce the entries array now.`;

  return { system, user };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/digest/prompt.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/digest/prompt.ts lib/digest/prompt.test.ts
git commit -m "feat: add synthesis prompt builder, ported from n8n Build Synthesis Prompt"
```

---

### Task 7: Claude synthesis call and response parsing

**Files:**
- Create: `lib/digest/synthesize.ts`
- Test: `lib/digest/synthesize.test.ts`

**Interfaces:**
- Consumes: `buildSynthesisPrompt` from `lib/digest/prompt.ts`; `INDUSTRIES` from `lib/digest/config.ts`; `getAnthropicClient`, `DIGEST_MODEL` from `lib/anthropic.ts`; `IngestItem`, `IngestEntry` from `lib/ingest/schema.ts`
- Produces: `parseEntriesResponse(text: string, validKeys: Set<string>): IngestEntry[]`, `synthesizeEntries(args: { items: IngestItem[]; date: string }): Promise<IngestEntry[]>`

`parseEntriesResponse` is ported verbatim from the n8n "Assemble Final Payload" Code node's Claude-response handling: finds the `[...]` slice, parses it, and strips any `source_refs` the model invented that don't match a real item key (defense in depth — `runIngest`'s schema validation would otherwise reject the whole payload over one bad ref).

- [ ] **Step 1: Write the failing test**

```ts
// lib/digest/synthesize.test.ts
import { describe, it, expect } from "vitest";
import { parseEntriesResponse } from "@/lib/digest/synthesize";

const VALID_KEYS = new Set(["k1", "k2"]);

describe("parseEntriesResponse", () => {
  it("parses a clean JSON array response", () => {
    const text = JSON.stringify([
      { category: "big_event", industry: "energy", title: "T", body: "B", position: 0, source_refs: ["k1"] },
    ]);
    const entries = parseEntriesResponse(text, VALID_KEYS);
    expect(entries).toHaveLength(1);
    expect(entries[0].source_refs).toEqual(["k1"]);
  });

  it("strips accidental markdown fences around the array", () => {
    const text = "```json\n" + JSON.stringify([
      { category: "world_news", industry: null, title: "T", body: "B", position: 0, source_refs: [] },
    ]) + "\n```";
    expect(parseEntriesResponse(text, VALID_KEYS)).toHaveLength(1);
  });

  it("filters out source_refs that don't match a real item key", () => {
    const text = JSON.stringify([
      { category: "finance", industry: null, title: "T", body: "B", position: 0, source_refs: ["k1", "invented-key"] },
    ]);
    expect(parseEntriesResponse(text, VALID_KEYS)[0].source_refs).toEqual(["k1"]);
  });

  it("defaults missing source_refs to an empty array", () => {
    const text = JSON.stringify([{ category: "finance", industry: null, title: "T", body: "B", position: 0 }]);
    expect(parseEntriesResponse(text, VALID_KEYS)[0].source_refs).toEqual([]);
  });

  it("throws when no JSON array is present", () => {
    expect(() => parseEntriesResponse("no array here", VALID_KEYS)).toThrow(/Could not find a JSON array/);
  });

  it("throws when the sliced text isn't valid JSON", () => {
    expect(() => parseEntriesResponse("[not valid json}", VALID_KEYS)).toThrow(/Failed to parse/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/digest/synthesize.test.ts`
Expected: FAIL — `Cannot find module '@/lib/digest/synthesize'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/digest/synthesize.ts
import { getAnthropicClient, DIGEST_MODEL } from "@/lib/anthropic";
import { buildSynthesisPrompt } from "@/lib/digest/prompt";
import { INDUSTRIES } from "@/lib/digest/config";
import type { IngestItem, IngestEntry } from "@/lib/ingest/schema";

export function parseEntriesResponse(text: string, validKeys: Set<string>): IngestEntry[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error(`Could not find a JSON array in Claude's response: ${text.slice(0, 500)}`);
  }
  const jsonSlice = text.slice(start, end + 1);

  let entries: IngestEntry[];
  try {
    entries = JSON.parse(jsonSlice);
  } catch (e) {
    throw new Error(`Failed to parse Claude's entries JSON: ${(e as Error).message}\n${jsonSlice.slice(0, 500)}`);
  }

  for (const entry of entries) {
    entry.source_refs = (entry.source_refs ?? []).filter((k) => validKeys.has(k));
  }

  return entries;
}

export async function synthesizeEntries({
  items,
  date,
}: {
  items: IngestItem[];
  date: string;
}): Promise<IngestEntry[]> {
  const { system, user } = buildSynthesisPrompt({ items, industries: INDUSTRIES, date });

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: DIGEST_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Unexpected Claude response shape: ${JSON.stringify(response).slice(0, 500)}`);
  }

  const validKeys = new Set(items.map((i) => i.key));
  return parseEntriesResponse(textBlock.text, validKeys);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/digest/synthesize.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/digest/synthesize.ts lib/digest/synthesize.test.ts
git commit -m "feat: add Claude synthesis call, ported from n8n Call Claude / Assemble Final Payload"
```

---

### Task 8: Extract shared ingest logic; refactor `/api/ingest` to use it

**Files:**
- Create: `lib/ingest/run.ts`
- Test: `lib/ingest/run.test.ts`
- Modify: `app/api/ingest/route.ts`

**Interfaces:**
- Consumes: `ingestPayloadSchema` from `lib/ingest/schema.ts`; `validateSlugs` from `lib/ingest/validate-slugs.ts`; `transformPayload` from `lib/ingest/transform.ts`; `getServiceClient` from `lib/db.ts`
- Produces: `type IngestResult = { ok: true; date: string; items: number; entries: number } | { ok: false; status: number; body: Record<string, unknown> }`, `runIngest(payload: unknown): Promise<IngestResult>`

This pulls the validate → check-slugs → transform → write body out of the current route handler so both `/api/ingest` and the new `/api/cron/digest/finish` route (Task 11) can call it directly in-process. No behavior change to `/api/ingest`'s HTTP responses.

- [ ] **Step 1: Write the failing test**

```ts
// lib/ingest/run.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Vitest hoists vi.mock factories above top-level const declarations, and
// only allows the factory to reference outer variables whose names start
// with "mock" — hence mockFrom/mockRpc rather than fromMock/rpcMock.
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/db", () => ({
  getServiceClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import { runIngest } from "@/lib/ingest/run";

function selectResult(slugs: string[]) {
  return { select: () => Promise.resolve({ data: slugs.map((slug) => ({ slug })), error: null }) };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("runIngest", () => {
  it("returns 422 for a payload that fails schema validation", async () => {
    const result = await runIngest({ date: "not-a-date", entries: [], items: [] });
    expect(result).toMatchObject({ ok: false, status: 422 });
  });

  it("returns 422 listing unknown industry/category slugs", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "industries" ? selectResult([]) : selectResult([]),
    );
    const result = await runIngest({
      date: "2026-07-22",
      entries: [
        { category: "big_event", industry: "energy", title: "T", body: "B", position: 0, source_refs: [] },
      ],
      items: [],
    });
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      body: { unknown_industries: ["energy"], unknown_categories: ["big_event"] },
    });
  });

  it("writes the digest and returns counts on a valid payload", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "industries" ? selectResult(["energy"]) : selectResult(["big_event"]),
    );
    mockRpc.mockResolvedValue({ error: null });

    const result = await runIngest({
      date: "2026-07-22",
      entries: [
        { category: "big_event", industry: "energy", title: "T", body: "B", position: 0, source_refs: ["k1"] },
      ],
      items: [{ key: "k1", industry: "energy", source_type: "reddit", title: "I", position: 0 }],
    });

    expect(result).toEqual({ ok: true, date: "2026-07-22", items: 1, entries: 1 });
    expect(mockRpc).toHaveBeenCalledWith("replace_digest", expect.objectContaining({ p_digest: expect.any(Object) }));
  });

  it("returns 500 when the write RPC fails", async () => {
    mockFrom.mockImplementation((table: string) =>
      table === "industries" ? selectResult(["energy"]) : selectResult(["big_event"]),
    );
    mockRpc.mockResolvedValue({ error: { message: "db exploded" } });

    const result = await runIngest({
      date: "2026-07-22",
      entries: [
        { category: "big_event", industry: "energy", title: "T", body: "B", position: 0, source_refs: [] },
      ],
      items: [],
    });
    expect(result).toEqual({ ok: false, status: 500, body: { error: "db exploded" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ingest/run.test.ts`
Expected: FAIL — `Cannot find module '@/lib/ingest/run'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/ingest/run.ts
import { ingestPayloadSchema } from "@/lib/ingest/schema";
import { validateSlugs } from "@/lib/ingest/validate-slugs";
import { transformPayload } from "@/lib/ingest/transform";
import { getServiceClient } from "@/lib/db";

export type IngestResult =
  | { ok: true; date: string; items: number; entries: number }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function runIngest(payload: unknown): Promise<IngestResult> {
  const parsed = ingestPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, status: 422, body: { error: "invalid payload", issues: parsed.error.issues } };
  }

  const db = getServiceClient();
  const [industriesRes, categoriesRes] = await Promise.all([
    db.from("industries").select("slug"),
    db.from("categories").select("slug"),
  ]);
  if (industriesRes.error || categoriesRes.error) {
    const message = industriesRes.error?.message ?? categoriesRes.error?.message;
    return { ok: false, status: 500, body: { error: message } };
  }

  const unknown = validateSlugs(
    parsed.data,
    new Set(industriesRes.data.map((r: { slug: string }) => r.slug)),
    new Set(categoriesRes.data.map((r: { slug: string }) => r.slug)),
  );
  if (unknown.unknownIndustries.length > 0 || unknown.unknownCategories.length > 0) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "unknown slugs — add them in Supabase (industries/categories tables) and re-run",
        unknown_industries: unknown.unknownIndustries,
        unknown_categories: unknown.unknownCategories,
      },
    };
  }

  const t = transformPayload(parsed.data);
  const { error } = await db.rpc("replace_digest", {
    p_digest: t.digest,
    p_items: t.items,
    p_entries: t.entries,
    p_entry_sources: t.entrySources,
  });
  if (error) {
    return { ok: false, status: 500, body: { error: error.message } };
  }

  return { ok: true, date: parsed.data.date, items: t.items.length, entries: t.entries.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ingest/run.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Refactor `app/api/ingest/route.ts` to call `runIngest`**

```ts
// app/api/ingest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest/run";
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

  const result = await runIngest(body);
  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json({ ok: true, date: result.date, items: result.items, entries: result.entries });
}
```

- [ ] **Step 6: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS, all files including `lib/ingest/transform.test.ts`, `lib/ingest/schema.test.ts`, `lib/ingest/validate-slugs.test.ts` unaffected

- [ ] **Step 7: Commit**

```bash
git add lib/ingest/run.ts lib/ingest/run.test.ts app/api/ingest/route.ts
git commit -m "refactor: extract runIngest so the cron pipeline can write digests in-process"
```

---

### Task 9: Cron auth helper

**Files:**
- Create: `lib/cron-auth.ts`
- Test: `lib/cron-auth.test.ts`

**Interfaces:**
- Consumes: `safeEqual` from `lib/auth.ts`
- Produces: `hasValidCronSecret(req: NextRequest): boolean`

Same bearer-token pattern as `/api/ingest`'s inline check, extracted since both new cron routes (Tasks 10-11) need it — mirrors the existing `lib/api-auth.ts` / `hasValidSession` shape.

- [ ] **Step 1: Write the failing test**

```ts
// lib/cron-auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { hasValidCronSecret } from "@/lib/cron-auth";

function reqWithAuth(header?: string): NextRequest {
  const headers = new Headers();
  if (header !== undefined) headers.set("authorization", header);
  return new NextRequest("http://localhost/api/cron/digest/start", { method: "POST", headers });
}

describe("hasValidCronSecret", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it("accepts a matching bearer token", () => {
    expect(hasValidCronSecret(reqWithAuth("Bearer test-cron-secret"))).toBe(true);
  });

  it("rejects a missing authorization header", () => {
    expect(hasValidCronSecret(reqWithAuth())).toBe(false);
  });

  it("rejects a non-matching token", () => {
    expect(hasValidCronSecret(reqWithAuth("Bearer wrong-token"))).toBe(false);
  });

  it("fails closed when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    expect(hasValidCronSecret(reqWithAuth("Bearer test-cron-secret"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/cron-auth.test.ts`
Expected: FAIL — `Cannot find module '@/lib/cron-auth'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cron-auth.ts
import { NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";

export function hasValidCronSecret(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && token && safeEqual(token, expected));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/cron-auth.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/cron-auth.ts lib/cron-auth.test.ts
git commit -m "feat: add shared bearer-token auth for cron routes"
```

---

### Task 10: `POST /api/cron/digest/start`

**Files:**
- Create: `app/api/cron/digest/start/route.ts`
- Test: `app/api/cron/digest/start/route.test.ts`

**Interfaces:**
- Consumes: `hasValidCronSecret` from `lib/cron-auth.ts`; `buildRedditStartUrls`, `startRedditScrape` from `lib/digest/reddit.ts`; `INDUSTRIES` from `lib/digest/config.ts`

Kicks off the Apify Reddit scrape and returns immediately (202) — this is the piece the external poller calls once a day.

- [ ] **Step 1: Write the failing test**

```ts
// app/api/cron/digest/start/route.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/digest/start", { method: "POST", headers });
}

describe("POST /api/cron/digest/start auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("rejects requests without a valid cron secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/cron/digest/start/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write minimal implementation**

```ts
// app/api/cron/digest/start/route.ts
import { NextRequest, NextResponse } from "next/server";
import { hasValidCronSecret } from "@/lib/cron-auth";
import { buildRedditStartUrls, startRedditScrape } from "@/lib/digest/reddit";
import { INDUSTRIES } from "@/lib/digest/config";

export async function POST(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { startUrls } = buildRedditStartUrls(INDUSTRIES);
  await startRedditScrape(startUrls);

  return NextResponse.json({ status: "started" }, { status: 202 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/cron/digest/start/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add app/api/cron/digest/start/route.ts app/api/cron/digest/start/route.test.ts
git commit -m "feat: add /api/cron/digest/start route to trigger the reddit scrape"
```

---

### Task 11: `POST /api/cron/digest/finish`

**Files:**
- Create: `app/api/cron/digest/finish/route.ts`
- Test: `app/api/cron/digest/finish/route.test.ts`
- Modify: `lib/dates.ts` (add `todayISO`)

**Interfaces:**
- Consumes: `hasValidCronSecret` from `lib/cron-auth.ts`; `getDigestByDate` from `lib/queries.ts`; `checkRedditRun`, `shapeRedditItems`, `buildRedditStartUrls` from `lib/digest/reddit.ts`; `fetchNewsItems` from `lib/digest/news.ts`; `fetchMarketItems` from `lib/digest/market.ts`; `assembleAndCap` from `lib/digest/assemble.ts`; `synthesizeEntries` from `lib/digest/synthesize.ts`; `runIngest` from `lib/ingest/run.ts`; `INDUSTRIES`, `NEWS_FEEDS`, `MARKET_TICKERS` from `lib/digest/config.ts`; `todayISO` from `lib/dates.ts`

Polled every 1-2 minutes by the external poller after `/start`. Short-circuits if today's digest already exists (idempotency guard against repeated polls after success) or if the Apify run isn't done yet; otherwise runs the rest of the pipeline and writes the digest.

- [ ] **Step 1: Add `todayISO` to `lib/dates.ts`**

```ts
// lib/dates.ts — append below isValidDigestDate
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Add a test for it to `lib/dates.test.ts`**

```ts
// lib/dates.test.ts — add import and describe block
import { isValidDigestDate, todayISO } from "@/lib/dates";
// (replace the existing single-symbol import line with the one above)

describe("todayISO", () => {
  it("returns a valid YYYY-MM-DD digest date", () => {
    expect(isValidDigestDate(todayISO())).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify the new date test passes**

Run: `npx vitest run lib/dates.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 4: Write the failing route test**

```ts
// app/api/cron/digest/finish/route.test.ts
import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/cron/digest/finish", { method: "POST" });
}

describe("POST /api/cron/digest/finish auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("rejects requests without a valid cron secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run app/api/cron/digest/finish/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 6: Write minimal implementation**

```ts
// app/api/cron/digest/finish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { hasValidCronSecret } from "@/lib/cron-auth";
import { getDigestByDate } from "@/lib/queries";
import { buildRedditStartUrls, checkRedditRun, shapeRedditItems } from "@/lib/digest/reddit";
import { fetchNewsItems } from "@/lib/digest/news";
import { fetchMarketItems } from "@/lib/digest/market";
import { assembleAndCap } from "@/lib/digest/assemble";
import { synthesizeEntries } from "@/lib/digest/synthesize";
import { runIngest } from "@/lib/ingest/run";
import { INDUSTRIES, NEWS_FEEDS, MARKET_TICKERS } from "@/lib/digest/config";
import { todayISO } from "@/lib/dates";

export async function POST(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const date = todayISO();

  const existing = await getDigestByDate(date);
  if (existing) {
    return NextResponse.json({ status: "already_done" });
  }

  const run = await checkRedditRun();
  if (!run.ready) {
    return NextResponse.json({ status: "pending" });
  }

  const { subredditToIndustry } = buildRedditStartUrls(INDUSTRIES);
  const [redditItems, newsItems, marketItems] = await Promise.all([
    Promise.resolve(shapeRedditItems(run.posts, subredditToIndustry)),
    fetchNewsItems(NEWS_FEEDS),
    fetchMarketItems(MARKET_TICKERS),
  ]);
  const items = assembleAndCap([...redditItems, ...newsItems, ...marketItems]);

  const entries = await synthesizeEntries({ items, date });
  const result = await runIngest({ date, items, entries });

  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json({ status: "done", date: result.date, items: result.items, entries: result.entries });
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run app/api/cron/digest/finish/route.test.ts`
Expected: PASS (1 test)

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS, all test files green

- [ ] **Step 9: Commit**

```bash
git add app/api/cron/digest/finish/route.ts app/api/cron/digest/finish/route.test.ts lib/dates.ts lib/dates.test.ts
git commit -m "feat: add /api/cron/digest/finish route to complete the daily pipeline"
```

---

### Task 12: Env vars and docs

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/cron-pipeline.md`

**Interfaces:**
- None (documentation/config only)

- [ ] **Step 1: Add the new env vars to `.env.example`**

```
# Reddit scraping (Apify actor: trudax~reddit-scraper-lite)
APIFY_API_TOKEN=

# Bearer token your external poller uses to POST /api/cron/digest/start and /finish (generate: openssl rand -hex 32)
CRON_SECRET=

# Anthropic API key, used both for entry deep-dives/chat and daily digest synthesis
ANTHROPIC_API_KEY=
```

Add this block to the existing `.env.example` (append after the existing `INGEST_TOKEN` line; `ANTHROPIC_API_KEY` may already be listed — if so, don't duplicate it, just add `APIFY_API_TOKEN` and `CRON_SECRET`).

- [ ] **Step 2: Write `docs/cron-pipeline.md`**

```markdown
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

## Manual ingest still works

`/api/ingest` (see `docs/ingest-contract.md`) is unchanged and still used by
`scripts/seed.ts` and for manual backfills — it's a normal HTTP POST with a
`date`/`entries`/`items` payload, independent of this cron pipeline.
```

- [ ] **Step 3: Update the root `README.md`'s description of the pipeline**

Replace this paragraph in `README.md`:

```markdown
A personal industry digest. An n8n pipeline scrapes news/reddit/market data
once a day and POSTs it to `/api/ingest`; the app itself is read-only — it
just renders whatever the pipeline last wrote to Supabase (a home feed of six
curated categories, plus a per-industry drill-down of everything scraped).
```

with:

```markdown
A personal industry digest. The app itself fetches news/reddit/market data
once a day (`app/api/cron/digest/`, driven by an external scheduler — see
`docs/cron-pipeline.md`), has Claude synthesize it into a six-category home
feed, and stores it in Supabase alongside a per-industry drill-down of
everything scraped. (An earlier version of this pipeline ran in n8n —
`n8n/industry-digest-workflow.json` is kept for reference but is no longer
required.)
```

And add a bullet to the "Further reading" list:

```markdown
- `docs/cron-pipeline.md` — the two-phase cron pipeline that replaced the n8n
  workflow: what each route does, the polling schedule, required env vars.
```

- [ ] **Step 4: Run the full suite one more time**

Run: `npm test`
Expected: PASS, all test files green (documentation-only task, but confirms nothing was left broken)

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md docs/cron-pipeline.md
git commit -m "docs: document the cron pipeline and new required env vars"
```

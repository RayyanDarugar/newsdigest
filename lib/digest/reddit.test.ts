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

    expect(await checkRedditRun("2026-07-22")).toEqual({ ready: false });
  });

  it("checkRedditRun fetches the dataset once a SUCCEEDED run is found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { startedAt: "2026-07-22T06:03:00.000Z", defaultDatasetId: "ds-abc123" } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ title: "a post" }] });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await checkRedditRun("2026-07-22");
    expect(result).toEqual({ ready: true, posts: [{ title: "a post" }] });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.apify.com/v2/datasets/ds-abc123/items?limit=150&token=test-token",
    );
  });

  it("checkRedditRun returns not-ready when the last SUCCEEDED run started on a different day than the target date", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: { startedAt: "2026-07-21T23:59:00.000Z", defaultDatasetId: "ds-abc123" } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await checkRedditRun("2026-07-22");
    expect(result).toEqual({ ready: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

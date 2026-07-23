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

export async function checkRedditRun(date: string): Promise<RedditRunCheck> {
  const statusRes = await fetch(
    `${APIFY_BASE}/acts/${ACTOR_ID}/runs/last?status=SUCCEEDED&token=${apifyToken()}`,
  );
  if (statusRes.status === 404) return { ready: false };
  if (!statusRes.ok) {
    throw new Error(`Apify run status check failed: ${statusRes.status} ${await statusRes.text()}`);
  }
  const statusBody = (await statusRes.json()) as {
    data: { startedAt: string; defaultDatasetId: string };
  };
  const startedDate = statusBody.data.startedAt.slice(0, 10);
  if (startedDate !== date) return { ready: false };

  const datasetRes = await fetch(
    `${APIFY_BASE}/datasets/${statusBody.data.defaultDatasetId}/items?limit=150&token=${apifyToken()}`,
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
    } catch (e) {
      console.warn("shapeRedditItems: skipping malformed post", post.id, e);
      continue;
    }
  }

  return items;
}

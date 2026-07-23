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

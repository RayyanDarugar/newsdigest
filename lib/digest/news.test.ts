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

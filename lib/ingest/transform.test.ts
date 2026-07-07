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

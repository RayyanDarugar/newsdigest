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

  it("rejects a calendar-invalid date", () => {
    const p = validPayload();
    p.date = "2026-02-30";
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

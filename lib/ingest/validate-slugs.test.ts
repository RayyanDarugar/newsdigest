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

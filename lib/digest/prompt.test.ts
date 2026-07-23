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

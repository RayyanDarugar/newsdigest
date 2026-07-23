// lib/digest/synthesize.test.ts
import { describe, it, expect } from "vitest";
import { parseEntriesResponse, filterDanglingSourceRefs } from "@/lib/digest/synthesize";
import type { IngestEntry } from "@/lib/ingest/schema";

const VALID_KEYS = new Set(["k1", "k2"]);

describe("filterDanglingSourceRefs", () => {
  it("keeps source_refs that match a real item key", () => {
    const entries: IngestEntry[] = [
      { category: "finance", industry: null, title: "T", body: "B", position: 0, source_refs: ["k1", "k2"] },
    ];
    expect(filterDanglingSourceRefs(entries, VALID_KEYS)[0].source_refs).toEqual(["k1", "k2"]);
  });

  it("drops source_refs that don't match any item key", () => {
    const entries: IngestEntry[] = [
      { category: "finance", industry: null, title: "T", body: "B", position: 0, source_refs: ["k1", "invented"] },
    ];
    expect(filterDanglingSourceRefs(entries, VALID_KEYS)[0].source_refs).toEqual(["k1"]);
  });

  it("leaves an empty source_refs array empty", () => {
    const entries: IngestEntry[] = [
      { category: "finance", industry: null, title: "T", body: "B", position: 0, source_refs: [] },
    ];
    expect(filterDanglingSourceRefs(entries, VALID_KEYS)[0].source_refs).toEqual([]);
  });

  it("does not mutate the input entries", () => {
    const entries: IngestEntry[] = [
      { category: "finance", industry: null, title: "T", body: "B", position: 0, source_refs: ["k1", "invented"] },
    ];
    filterDanglingSourceRefs(entries, VALID_KEYS);
    expect(entries[0].source_refs).toEqual(["k1", "invented"]);
  });
});

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
    expect(() => parseEntriesResponse("[not valid json]", VALID_KEYS)).toThrow(/Failed to parse/);
  });
});

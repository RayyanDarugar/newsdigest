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

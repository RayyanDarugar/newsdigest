import { describe, expect, it } from "vitest";
import {
  ANGLES_DELIMITER,
  buildChatSystemPrompt,
  buildDeepDivePrompt,
} from "@/lib/deepdive/prompt";
import type { DigestEntry, EntryWithSources } from "@/lib/types";

const entry: EntryWithSources = {
  id: "e1",
  digest_id: "d1",
  category_slug: "big_event",
  industry_slug: "energy",
  title: "Oil markets spike",
  body: "Crude jumped to $78.",
  position: 0,
  sources: [
    {
      id: "s1",
      digest_id: "d1",
      industry_slug: "energy",
      source_type: "news",
      title: "BBC: oil surges",
      url: "https://bbc.com/x",
      summary: "Oil prices surged after strikes.",
      metadata: {},
      position: 0,
    },
  ],
};

const dayEntries: DigestEntry[] = [
  entry,
  {
    id: "e2",
    digest_id: "d1",
    category_slug: "world_news",
    industry_slug: null,
    title: "Ukraine missile license",
    body: "Domestic Patriot production announced.",
    position: 0,
  },
];

describe("buildDeepDivePrompt", () => {
  const { system, user } = buildDeepDivePrompt({
    entry,
    dayEntries,
    bio: "USC student interested in logistics startups",
    date: "2026-07-08",
  });

  it("includes the entry, its sources, and the date", () => {
    expect(user).toContain("Oil markets spike");
    expect(user).toContain("BBC: oil surges");
    expect(user).toContain("2026-07-08");
  });

  it("includes other entries from the day but not the entry itself twice", () => {
    expect(user).toContain("Ukraine missile license");
    // The focal entry appears once in its own section, not in the day context.
    expect(user.split("Oil markets spike").length - 1).toBe(1);
  });

  it("includes the profile bio and the angles delimiter instruction", () => {
    expect(system).toContain("USC student interested in logistics startups");
    expect(system).toContain(ANGLES_DELIMITER);
  });

  it("omits the profile section when bio is empty", () => {
    const { system: s2 } = buildDeepDivePrompt({
      entry,
      dayEntries,
      bio: "",
      date: "2026-07-08",
    });
    expect(s2).not.toContain("About the reader");
  });
});

describe("buildChatSystemPrompt", () => {
  it("includes entry, deep dive, day context, and bio", () => {
    const system = buildChatSystemPrompt({
      entry,
      dayEntries,
      deepDiveSummary: "The oil spike traces to strait tensions.",
      bio: "USC student",
      date: "2026-07-08",
    });
    expect(system).toContain("Oil markets spike");
    expect(system).toContain("strait tensions");
    expect(system).toContain("Ukraine missile license");
    expect(system).toContain("USC student");
  });
});

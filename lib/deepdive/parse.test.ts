import { describe, expect, it } from "vitest";
import { extractCitedSources, parseDeepDive } from "@/lib/deepdive/parse";
import { ANGLES_DELIMITER } from "@/lib/deepdive/prompt";

const GOOD = `## What happened

Oil spiked on strait tensions.

${ANGLES_DELIMITER}
[{"title": "Logistics hedging tools", "rationale": "Shippers need it.", "first_move": "Interview 3 freight brokers."}]`;

describe("parseDeepDive", () => {
  it("splits summary and angles on the delimiter", () => {
    const { summary, angles } = parseDeepDive(GOOD);
    expect(summary).toContain("Oil spiked");
    expect(summary).not.toContain(ANGLES_DELIMITER);
    expect(angles).toHaveLength(1);
    expect(angles[0].title).toBe("Logistics hedging tools");
  });

  it("tolerates markdown fences around the angles JSON", () => {
    const fenced = GOOD.replace("[{", "```json\n[{").replace("}]", "}]\n```");
    expect(parseDeepDive(fenced).angles).toHaveLength(1);
  });

  it("falls back to full text + empty angles when the delimiter is missing", () => {
    const { summary, angles } = parseDeepDive("Just an analysis, no angles.");
    expect(summary).toBe("Just an analysis, no angles.");
    expect(angles).toEqual([]);
  });

  it("falls back to empty angles on malformed JSON without losing the summary", () => {
    const bad = `Analysis text.\n${ANGLES_DELIMITER}\n[{"title": broken`;
    const { summary, angles } = parseDeepDive(bad);
    expect(summary).toBe("Analysis text.");
    expect(angles).toEqual([]);
  });

  it("drops angle items missing required fields", () => {
    const partial = `A.\n${ANGLES_DELIMITER}\n[{"title":"ok","rationale":"r","first_move":"f"},{"title":"missing fields"}]`;
    expect(parseDeepDive(partial).angles).toHaveLength(1);
  });
});

describe("extractCitedSources", () => {
  it("collects and dedupes citation URLs from text blocks", () => {
    const content = [
      {
        type: "text",
        text: "a",
        citations: [
          { type: "web_search_result_location", url: "https://x.com/1", title: "One" },
          { type: "web_search_result_location", url: "https://x.com/1", title: "One" },
        ],
      },
      {
        type: "text",
        text: "b",
        citations: [
          { type: "web_search_result_location", url: "https://x.com/2", title: "Two" },
        ],
      },
      { type: "server_tool_use", id: "t1", name: "web_search", input: {} },
    ];
    expect(extractCitedSources(content)).toEqual([
      { title: "One", url: "https://x.com/1" },
      { title: "Two", url: "https://x.com/2" },
    ]);
  });

  it("returns empty for content without citations", () => {
    expect(extractCitedSources([{ type: "text", text: "plain" }])).toEqual([]);
  });
});

import type { Angle, DeepDiveSource } from "@/lib/types";
import { ANGLES_DELIMITER } from "@/lib/deepdive/prompt";

// Same defensive philosophy as the n8n payload node: never lose the summary
// over a formatting problem in the angles JSON.
export function parseDeepDive(text: string): {
  summary: string;
  angles: Angle[];
} {
  const idx = text.indexOf(ANGLES_DELIMITER);
  if (idx === -1) return { summary: text.trim(), angles: [] };

  const summary = text.slice(0, idx).trim();
  let anglesRaw = text.slice(idx + ANGLES_DELIMITER.length);

  // Strip accidental markdown fences.
  const start = anglesRaw.indexOf("[");
  const end = anglesRaw.lastIndexOf("]");
  if (start === -1 || end === -1) return { summary, angles: [] };
  anglesRaw = anglesRaw.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(anglesRaw);
  } catch {
    return { summary, angles: [] };
  }
  if (!Array.isArray(parsed)) return { summary, angles: [] };

  const angles = parsed.filter(
    (a): a is Angle =>
      typeof a === "object" &&
      a !== null &&
      typeof (a as Angle).title === "string" &&
      typeof (a as Angle).rationale === "string" &&
      typeof (a as Angle).first_move === "string",
  );
  return { summary, angles };
}

type CitationLike = { url?: unknown; title?: unknown };
type BlockLike = { type?: unknown; citations?: unknown };

export function extractCitedSources(content: unknown[]): DeepDiveSource[] {
  const byUrl = new Map<string, DeepDiveSource>();
  for (const block of content) {
    const b = block as BlockLike;
    if (b.type !== "text" || !Array.isArray(b.citations)) continue;
    for (const c of b.citations as CitationLike[]) {
      if (typeof c.url === "string" && !byUrl.has(c.url)) {
        byUrl.set(c.url, {
          url: c.url,
          title: typeof c.title === "string" ? c.title : c.url,
        });
      }
    }
  }
  return Array.from(byUrl.values());
}

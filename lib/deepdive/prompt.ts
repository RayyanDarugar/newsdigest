import type { DigestEntry, EntryWithSources } from "@/lib/types";

export const ANGLES_DELIMITER = "===ANGLES===";

function sourcesBlock(entry: EntryWithSources): string {
  if (entry.sources.length === 0) return "(no linked source items)";
  return entry.sources
    .map(
      (s) =>
        `- [${s.source_type}] ${s.title}${s.url ? ` (${s.url})` : ""}${
          s.summary ? ` — ${s.summary}` : ""
        }`,
    )
    .join("\n");
}

function dayContextBlock(entry: EntryWithSources, dayEntries: DigestEntry[]): string {
  const others = dayEntries.filter((e) => e.id !== entry.id);
  if (others.length === 0) return "(no other entries)";
  return others
    .map((e) => `- [${e.category_slug}] ${e.title}: ${e.body}`)
    .join("\n");
}

function bioBlock(bio: string): string {
  if (!bio.trim()) return "";
  return `\n\nAbout the reader (use this to personalize business angles):\n${bio.trim()}`;
}

export function buildDeepDivePrompt({
  entry,
  dayEntries,
  bio,
  date,
}: {
  entry: EntryWithSources;
  dayEntries: DigestEntry[];
  bio: string;
  date: string;
}): { system: string; user: string } {
  const system = `You are the deep-dive analyst for a personal industry-intelligence digest.
Given one digest entry, its raw sources, and the day's broader context, write a
detailed analysis. Use web search (up to 3 searches) to add background, key
players, and developments beyond the stored summaries — but stay grounded;
never invent facts.

Output format (strict):
1. A markdown analysis (~300-500 words). Use short ## section headings. No
   top-level title — the page already shows one.
2. Then a line containing exactly ${ANGLES_DELIMITER}
3. Then a raw JSON array (no markdown fences) of 2-4 business angles:
   [{ "title": string, "rationale": string, "first_move": string }]
   - "rationale": why this angle fits this story${bio.trim() ? " and this reader" : ""} (2-3 sentences).
   - "first_move": the concrete first step to explore it (1 sentence).${bioBlock(bio)}`;

  const user = `Digest date: ${date}

## The entry to analyze
Category: ${entry.category_slug}
Industry: ${entry.industry_slug ?? "(none)"}
Title: ${entry.title}
Summary: ${entry.body}

## Its raw sources
${sourcesBlock(entry)}

## Other entries from the same day (context)
${dayContextBlock(entry, dayEntries)}

Write the deep dive now.`;

  return { system, user };
}

export function buildChatSystemPrompt({
  entry,
  dayEntries,
  deepDiveSummary,
  bio,
  date,
}: {
  entry: EntryWithSources;
  dayEntries: DigestEntry[];
  deepDiveSummary: string;
  bio: string;
  date: string;
}): string {
  return `You are a sharp, concise analyst chatting about one story from a
personal industry-intelligence digest dated ${date}. Answer questions, explore
business implications, and use web search (up to 3 searches per reply) for
anything beyond the provided context. Keep replies conversational — a few
short paragraphs at most.

## The story
Category: ${entry.category_slug} | Industry: ${entry.industry_slug ?? "(none)"}
Title: ${entry.title}
Summary: ${entry.body}

## Its raw sources
${sourcesBlock(entry)}

## The deep-dive analysis already shown to the user
${deepDiveSummary}

## Other entries from the same day
${dayContextBlock(entry, dayEntries)}${bioBlock(bio)}`;
}

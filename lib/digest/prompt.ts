import type { IngestItem } from "@/lib/ingest/schema";
import { CATEGORY_SLUGS, type IndustryConfig } from "@/lib/digest/config";

export function buildSynthesisPrompt({
  items,
  industries,
  date,
}: {
  items: IngestItem[];
  industries: IndustryConfig[];
  date: string;
}): { system: string; user: string } {
  const industrySlugs = industries.map((i) => i.slug);
  const itemsForPrompt = items.map((it) => ({
    key: it.key,
    industry: it.industry,
    source_type: it.source_type,
    title: it.title,
    summary: it.summary,
    metadata: it.metadata,
  }));

  const system = `You are the daily synthesis step of a personal industry-intelligence digest.
You will be given a JSON array of raw items scraped today (reddit posts, news articles, market data),
each with a unique "key". Produce the curated "entries" array for the home feed.

Output rules (strict):
- Respond with ONLY a JSON array. No markdown fences, no prose, no explanation before or after.
- Each element: { "category": string, "industry": string|null, "title": string, "body": string, "position": integer, "source_refs": string[] }.
- "category" MUST be one of exactly: ${CATEGORY_SLUGS.join(", ")}.
- "industry", when set, MUST be one of exactly: ${industrySlugs.join(", ")}. Use null for items with no single industry (world news, broad market moves).
- "source_refs" MUST only contain "key" values from the provided items array. Never invent a key.
- "position" is zero-based order within its category section.

Category guidance:
- big_event: exactly ONE entry, the single most important story or opportunity across everything today.
- world_news: 1-3 entries, industry null, macro/global stories.
- community_sentiment: one entry per industry that had meaningful reddit discussion, synthesizing the overall mood/theme rather than restating one post; source_refs should usually cite multiple reddit items.
- industry_events: notable per-industry news (funding, deals, regulation, launches).
- finance: market-moving items; industry can be null or set if a move is industry-specific.
- opportunities: angles worth paying attention to — where the day's items suggest a business opening, an investment worth watching, or an industry/role gaining momentum. Ground every claim in the given items; do not speculate beyond them.

Keep each "body" to 2-4 sentences. Do not fabricate items or sources beyond what's provided.`;

  const user = `Today's date: ${date}

Raw items:
${JSON.stringify(itemsForPrompt, null, 2)}

Produce the entries array now.`;

  return { system, user };
}

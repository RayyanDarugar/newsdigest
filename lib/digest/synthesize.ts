import { z } from "zod";
import { getAnthropicClient, DIGEST_MODEL } from "@/lib/anthropic";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { buildSynthesisPrompt } from "@/lib/digest/prompt";
import { CATEGORY_SLUGS, INDUSTRIES } from "@/lib/digest/config";
import type { IngestItem, IngestEntry } from "@/lib/ingest/schema";

// Structured outputs (client.messages.parse + output_config.format) makes the
// API itself guarantee schema-valid JSON, instead of relying on free-text
// prompting + best-effort parsing — this replaced a prior approach that
// occasionally produced malformed JSON from the raw model text (unescaped
// characters mid-string) and crashed the /finish route with an unhandled
// exception. parseEntriesResponse below is kept only as the fallback text
// parser and is no longer on the production path.
const industrySlugs = INDUSTRIES.map((i) => i.slug) as [string, ...string[]];

const entriesOutputSchema = z.object({
  entries: z.array(
    z.object({
      category: z.enum(CATEGORY_SLUGS),
      industry: z.enum(industrySlugs).nullable(),
      title: z.string(),
      body: z.string(),
      position: z.number().int(),
      source_refs: z.array(z.string()),
    }),
  ),
});

export function filterDanglingSourceRefs(entries: IngestEntry[], validKeys: Set<string>): IngestEntry[] {
  return entries.map((entry) => ({
    ...entry,
    source_refs: entry.source_refs.filter((k) => validKeys.has(k)),
  }));
}

export function parseEntriesResponse(text: string, validKeys: Set<string>): IngestEntry[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error(`Could not find a JSON array in Claude's response: ${text.slice(0, 500)}`);
  }
  const jsonSlice = text.slice(start, end + 1);

  let entries: IngestEntry[];
  try {
    entries = JSON.parse(jsonSlice);
  } catch (e) {
    throw new Error(`Failed to parse Claude's entries JSON: ${(e as Error).message}\n${jsonSlice.slice(0, 500)}`);
  }

  for (const entry of entries) {
    entry.source_refs = (entry.source_refs ?? []).filter((k) => validKeys.has(k));
  }

  return entries;
}

export async function synthesizeEntries({
  items,
  date,
}: {
  items: IngestItem[];
  date: string;
}): Promise<IngestEntry[]> {
  const { system, user } = buildSynthesisPrompt({ items, industries: INDUSTRIES, date });

  const client = getAnthropicClient();
  const response = await client.messages.parse({
    model: DIGEST_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(entriesOutputSchema) },
  });

  if (!response.parsed_output) {
    throw new Error(`Structured synthesis response had no parsed_output: ${JSON.stringify(response).slice(0, 500)}`);
  }

  const validKeys = new Set(items.map((i) => i.key));
  return filterDanglingSourceRefs(response.parsed_output.entries, validKeys);
}

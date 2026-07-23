import { getAnthropicClient, DIGEST_MODEL } from "@/lib/anthropic";
import { buildSynthesisPrompt } from "@/lib/digest/prompt";
import { INDUSTRIES } from "@/lib/digest/config";
import type { IngestItem, IngestEntry } from "@/lib/ingest/schema";

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
  const response = await client.messages.create({
    model: DIGEST_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`Unexpected Claude response shape: ${JSON.stringify(response).slice(0, 500)}`);
  }

  const validKeys = new Set(items.map((i) => i.key));
  return parseEntriesResponse(textBlock.text, validKeys);
}

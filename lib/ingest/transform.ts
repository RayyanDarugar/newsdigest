import type { IngestPayload } from "@/lib/ingest/schema";

export type TransformResult = {
  digest: { id: string; digest_date: string; raw_payload: IngestPayload };
  items: Array<{
    id: string;
    digest_id: string;
    industry_slug: string | null;
    source_type: string;
    title: string;
    url: string | null;
    summary: string | null;
    metadata: Record<string, unknown>;
    position: number;
  }>;
  entries: Array<{
    id: string;
    digest_id: string;
    category_slug: string;
    industry_slug: string | null;
    title: string;
    body: string;
    position: number;
  }>;
  entrySources: Array<{ entry_id: string; source_item_id: string }>;
};

export function transformPayload(payload: IngestPayload): TransformResult {
  const digestId = crypto.randomUUID();
  const keyToId = new Map<string, string>();

  const items = payload.items.map((item) => {
    const id = crypto.randomUUID();
    keyToId.set(item.key, id);
    return {
      id,
      digest_id: digestId,
      industry_slug: item.industry ?? null,
      source_type: item.source_type,
      title: item.title,
      url: item.url ?? null,
      summary: item.summary ?? null,
      metadata: item.metadata ?? {},
      position: item.position,
    };
  });

  const entries: TransformResult["entries"] = [];
  const entrySources: TransformResult["entrySources"] = [];

  for (const entry of payload.entries) {
    const id = crypto.randomUUID();
    entries.push({
      id,
      digest_id: digestId,
      category_slug: entry.category,
      industry_slug: entry.industry ?? null,
      title: entry.title,
      body: entry.body,
      position: entry.position,
    });
    for (const ref of entry.source_refs) {
      // Schema guarantees every ref resolves (superRefine in Task 4).
      entrySources.push({ entry_id: id, source_item_id: keyToId.get(ref)! });
    }
  }

  return {
    digest: { id: digestId, digest_date: payload.date, raw_payload: payload },
    items,
    entries,
    entrySources,
  };
}

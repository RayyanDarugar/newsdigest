import { ingestPayloadSchema } from "@/lib/ingest/schema";
import { validateSlugs } from "@/lib/ingest/validate-slugs";
import { transformPayload } from "@/lib/ingest/transform";
import { getServiceClient } from "@/lib/db";

export type IngestResult =
  | { ok: true; date: string; items: number; entries: number }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function runIngest(payload: unknown): Promise<IngestResult> {
  const parsed = ingestPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, status: 422, body: { error: "invalid payload", issues: parsed.error.issues } };
  }

  const db = getServiceClient();
  const [industriesRes, categoriesRes] = await Promise.all([
    db.from("industries").select("slug"),
    db.from("categories").select("slug"),
  ]);
  if (industriesRes.error || categoriesRes.error) {
    const message = industriesRes.error?.message ?? categoriesRes.error?.message;
    return { ok: false, status: 500, body: { error: message } };
  }

  const unknown = validateSlugs(
    parsed.data,
    new Set(industriesRes.data.map((r: { slug: string }) => r.slug)),
    new Set(categoriesRes.data.map((r: { slug: string }) => r.slug)),
  );
  if (unknown.unknownIndustries.length > 0 || unknown.unknownCategories.length > 0) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "unknown slugs — add them in Supabase (industries/categories tables) and re-run",
        unknown_industries: unknown.unknownIndustries,
        unknown_categories: unknown.unknownCategories,
      },
    };
  }

  const t = transformPayload(parsed.data);
  const { error } = await db.rpc("replace_digest", {
    p_digest: t.digest,
    p_items: t.items,
    p_entries: t.entries,
    p_entry_sources: t.entrySources,
  });
  if (error) {
    return { ok: false, status: 500, body: { error: error.message } };
  }

  return { ok: true, date: parsed.data.date, items: t.items.length, entries: t.entries.length };
}

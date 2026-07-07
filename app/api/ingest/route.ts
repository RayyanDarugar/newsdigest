import { NextRequest, NextResponse } from "next/server";
import { ingestPayloadSchema } from "@/lib/ingest/schema";
import { validateSlugs } from "@/lib/ingest/validate-slugs";
import { transformPayload } from "@/lib/ingest/transform";
import { getServiceClient } from "@/lib/db";
import { safeEqual } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const expected = process.env.INGEST_TOKEN;
  if (!expected || !token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const parsed = ingestPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const db = getServiceClient();
  const [industriesRes, categoriesRes] = await Promise.all([
    db.from("industries").select("slug"),
    db.from("categories").select("slug"),
  ]);
  if (industriesRes.error || categoriesRes.error) {
    const message = industriesRes.error?.message ?? categoriesRes.error?.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const unknown = validateSlugs(
    parsed.data,
    new Set(industriesRes.data.map((r) => r.slug)),
    new Set(categoriesRes.data.map((r) => r.slug)),
  );
  if (unknown.unknownIndustries.length > 0 || unknown.unknownCategories.length > 0) {
    return NextResponse.json(
      {
        error: "unknown slugs — add them in Supabase (industries/categories tables) and re-run",
        unknown_industries: unknown.unknownIndustries,
        unknown_categories: unknown.unknownCategories,
      },
      { status: 422 },
    );
  }

  const t = transformPayload(parsed.data);
  const { error } = await db.rpc("replace_digest", {
    p_digest: t.digest,
    p_items: t.items,
    p_entries: t.entries,
    p_entry_sources: t.entrySources,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    date: parsed.data.date,
    items: t.items.length,
    entries: t.entries.length,
  });
}

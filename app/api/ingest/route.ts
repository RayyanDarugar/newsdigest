import { NextRequest, NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest/run";
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

  const result = await runIngest(body);
  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json({ ok: true, date: result.date, items: result.items, entries: result.entries });
}

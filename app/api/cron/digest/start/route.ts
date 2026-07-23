import { NextRequest, NextResponse } from "next/server";
import { hasValidCronSecret } from "@/lib/cron-auth";
import { buildRedditStartUrls, startRedditScrape } from "@/lib/digest/reddit";
import { INDUSTRIES } from "@/lib/digest/config";

export async function POST(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { startUrls } = buildRedditStartUrls(INDUSTRIES);
  await startRedditScrape(startUrls);

  return NextResponse.json({ status: "started" }, { status: 202 });
}

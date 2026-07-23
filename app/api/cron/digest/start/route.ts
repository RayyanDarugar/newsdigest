import { NextRequest, NextResponse } from "next/server";
import { hasValidCronSecret } from "@/lib/cron-auth";
import { hasValidSession } from "@/lib/api-auth";
import { buildRedditStartUrls, startRedditScrape } from "@/lib/digest/reddit";
import { INDUSTRIES } from "@/lib/digest/config";

// Default Vercel function timeout is 10s; give the Apify kickoff call
// headroom in case it's briefly slow.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!hasValidCronSecret(req) && !(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { startUrls } = buildRedditStartUrls(INDUSTRIES);
  await startRedditScrape(startUrls);

  return NextResponse.json({ status: "started" }, { status: 202 });
}

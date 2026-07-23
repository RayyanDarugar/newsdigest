import { NextRequest, NextResponse } from "next/server";
import { hasValidCronSecret } from "@/lib/cron-auth";
import { hasValidSession } from "@/lib/api-auth";
import { getDigestByDate } from "@/lib/queries";
import { buildRedditStartUrls, startRedditScrape } from "@/lib/digest/reddit";
import { INDUSTRIES } from "@/lib/digest/config";
import { todayISO } from "@/lib/dates";

// Default Vercel function timeout is 10s; give the Apify kickoff call
// headroom in case it's briefly slow.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!hasValidCronSecret(req) && !(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Guard against paying for an Apify run nobody will use — /finish already
  // no-ops on a repeat trigger, but that check happens after the scrape is
  // kicked off; check here too so a stray/duplicate /start call doesn't
  // burn a run.
  const existing = await getDigestByDate(todayISO());
  if (existing) {
    return NextResponse.json({ status: "already_done" });
  }

  const { startUrls } = buildRedditStartUrls(INDUSTRIES);
  await startRedditScrape(startUrls);

  return NextResponse.json({ status: "started" }, { status: 202 });
}

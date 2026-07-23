import { NextRequest, NextResponse } from "next/server";
import { hasValidCronSecret } from "@/lib/cron-auth";
import { getDigestByDate } from "@/lib/queries";
import { buildRedditStartUrls, checkRedditRun, shapeRedditItems } from "@/lib/digest/reddit";
import { fetchNewsItems } from "@/lib/digest/news";
import { fetchMarketItems } from "@/lib/digest/market";
import { assembleAndCap } from "@/lib/digest/assemble";
import { synthesizeEntries } from "@/lib/digest/synthesize";
import { runIngest } from "@/lib/ingest/run";
import { INDUSTRIES, NEWS_FEEDS, MARKET_TICKERS } from "@/lib/digest/config";
import { todayISO } from "@/lib/dates";

export async function POST(req: NextRequest) {
  if (!hasValidCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const date = todayISO();

  const existing = await getDigestByDate(date);
  if (existing) {
    return NextResponse.json({ status: "already_done" });
  }

  const run = await checkRedditRun(date);
  if (!run.ready) {
    return NextResponse.json({ status: "pending" });
  }

  const { subredditToIndustry } = buildRedditStartUrls(INDUSTRIES);
  const [redditItems, newsItems, marketItems] = await Promise.all([
    Promise.resolve(shapeRedditItems(run.posts, subredditToIndustry)),
    fetchNewsItems(NEWS_FEEDS),
    fetchMarketItems(MARKET_TICKERS),
  ]);
  const items = assembleAndCap([...redditItems, ...newsItems, ...marketItems]);

  const entries = await synthesizeEntries({ items, date });
  const result = await runIngest({ date, items, entries });

  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }
  return NextResponse.json({ status: "done", date: result.date, items: result.items, entries: result.entries });
}

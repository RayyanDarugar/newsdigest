import type { IngestItem } from "@/lib/ingest/schema";

const REDDIT_PER_INDUSTRY = 4;
const NEWS_TOTAL = 10;

export function assembleAndCap(all: IngestItem[]): IngestItem[] {
  const reddit = all.filter((x) => x.source_type === "reddit");
  const news = all.filter((x) => x.source_type === "news");
  const market = all.filter((x) => x.source_type === "market");

  const cappedReddit: IngestItem[] = [];
  const seenPerIndustry: Record<string, number> = {};
  for (const item of reddit) {
    const key = item.industry ?? "";
    seenPerIndustry[key] = seenPerIndustry[key] ?? 0;
    if (seenPerIndustry[key] < REDDIT_PER_INDUSTRY) {
      cappedReddit.push(item);
      seenPerIndustry[key]++;
    }
  }

  const cappedNews = news.slice(0, NEWS_TOTAL);

  return renumber([...cappedReddit, ...cappedNews, ...market]);
}

function renumber(list: IngestItem[]): IngestItem[] {
  const counters: Record<string, number> = {};
  return list.map((item) => {
    const key = `${item.industry}::${item.source_type}`;
    counters[key] = counters[key] ?? 0;
    return { ...item, position: counters[key]++ };
  });
}

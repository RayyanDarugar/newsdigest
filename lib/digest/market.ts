import type { IngestItem } from "@/lib/ingest/schema";
import type { MarketTickerConfig } from "@/lib/digest/config";

export interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        regularMarketPrice: number;
        previousClose?: number;
        chartPreviousClose?: number;
      };
    }> | null;
  };
}

export function shapeMarketItem(
  ticker: MarketTickerConfig,
  data: YahooChartResponse,
  position: number,
): IngestItem | null {
  const meta = data.chart.result?.[0]?.meta;
  if (!meta) return null;

  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
  const sign = changePct >= 0 ? "+" : "";

  return {
    key: `market-${ticker.symbol}`,
    industry: null,
    source_type: "market",
    title: `${ticker.label} ${sign}${changePct.toFixed(2)}%`,
    url: null,
    summary: null,
    metadata: { ticker: ticker.symbol, change_pct: Math.round(changePct * 100) / 100, price },
    position,
  };
}

export async function fetchMarketItems(tickers: MarketTickerConfig[]): Promise<IngestItem[]> {
  const items = await Promise.all(
    tickers.map(async (ticker, i) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.symbol}?interval=1d&range=5d`,
          { headers: { "User-Agent": "IndustryDigestBot/1.0 (personal use)" } },
        );
        if (!res.ok) return null;
        const data = (await res.json()) as YahooChartResponse;
        return shapeMarketItem(ticker, data, i);
      } catch {
        return null;
      }
    }),
  );
  return items.filter((i): i is IngestItem => i !== null);
}

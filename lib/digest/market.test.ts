// lib/digest/market.test.ts
import { describe, it, expect } from "vitest";
import { shapeMarketItem } from "@/lib/digest/market";

const TICKER = { symbol: "SPY", label: "S&P 500 (SPY)" };

describe("shapeMarketItem", () => {
  it("computes a positive change percentage from previousClose", () => {
    const item = shapeMarketItem(
      TICKER,
      { chart: { result: [{ meta: { regularMarketPrice: 510, previousClose: 500 } }] } },
      2,
    );
    expect(item).toEqual({
      key: "market-SPY",
      industry: null,
      source_type: "market",
      title: "S&P 500 (SPY) +2.00%",
      url: null,
      summary: null,
      metadata: { ticker: "SPY", change_pct: 2, price: 510 },
      position: 2,
    });
  });

  it("computes a negative change percentage without a leading sign", () => {
    const item = shapeMarketItem(
      TICKER,
      { chart: { result: [{ meta: { regularMarketPrice: 490, previousClose: 500 } }] } },
      0,
    );
    expect(item?.title).toBe("S&P 500 (SPY) -2.00%");
  });

  it("falls back to chartPreviousClose when previousClose is absent", () => {
    const item = shapeMarketItem(
      TICKER,
      { chart: { result: [{ meta: { regularMarketPrice: 510, chartPreviousClose: 500 } }] } },
      0,
    );
    expect(item?.metadata?.change_pct).toBe(2);
  });

  it("returns null when the response has no result", () => {
    const item = shapeMarketItem(TICKER, { chart: { result: null } }, 0);
    expect(item).toBeNull();
  });
});

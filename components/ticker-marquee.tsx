import type { Industry, SourceItem } from "@/lib/types";

function formatTicker(item: SourceItem): string | null {
  const ticker = item.metadata.ticker;
  const pct = item.metadata.change_pct;
  if (typeof ticker !== "string" || typeof pct !== "number") return null;
  const sign = pct >= 0 ? "+" : "";
  const arrow = pct >= 0 ? "▲" : "▼";
  return `${ticker} ${arrow} ${sign}${pct.toFixed(2)}%`;
}

/**
 * A scrolling strip of the day's real market movers (from market source
 * items), padded out with the tracked industry names so it never looks
 * sparse. Nothing here is fabricated — if there's no market data for this
 * digest, it just scrolls industry names.
 */
export function TickerMarquee({
  marketItems,
  industries,
}: {
  marketItems: SourceItem[];
  industries: Industry[];
}) {
  const tickers = marketItems.map(formatTicker).filter((t): t is string => t !== null);
  const names = industries.map((i) => i.name.toUpperCase());
  const strip = [...tickers, ...names];
  if (strip.length === 0) return null;

  return (
    <div className="mb-8 overflow-hidden rounded border border-border bg-surface">
      <div className="flex w-max animate-[marquee-scroll_34s_linear_infinite]">
        {[...strip, ...strip].map((text, i) => {
          const isUp = text.includes("▲");
          const isDown = text.includes("▼");
          return (
            <span
              key={i}
              aria-hidden={i >= strip.length}
              className={`whitespace-nowrap border-r border-border px-5 py-2 font-mono text-[11px] uppercase tracking-wide last:border-r-0 ${
                isUp ? "text-up" : isDown ? "text-down" : "text-text-muted"
              }`}
            >
              {text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

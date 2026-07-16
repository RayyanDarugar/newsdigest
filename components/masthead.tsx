import Link from "next/link";
import type { Industry } from "@/lib/types";
import { getIndustryColor } from "@/lib/industry-colors";

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

export function Masthead({ industries }: { industries: Industry[] }) {
  const barColors = sample(industries, 5).map((i) => getIndustryColor(i.slug));
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  return (
    <header className="sticky top-0 z-20 -mx-4 border-b border-border bg-bg/90 px-4 pb-4 pt-6 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-display text-3xl font-extrabold uppercase tracking-tight"
        >
          {barColors.length > 0 && (
            <span className="flex h-7 w-2 flex-none flex-col overflow-hidden rounded-sm">
              {barColors.map((c, i) => (
                <span key={i} className="flex-1" style={{ background: c }} />
              ))}
            </span>
          )}
          Industry Digest
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text"
          >
            Settings
          </Link>
          <span className="font-mono text-xs uppercase tracking-wider text-text-muted">{today}</span>
          <span className="hidden -rotate-2 rounded border border-dashed border-text-muted px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted sm:inline-block">
            Today&rsquo;s edition
          </span>
        </div>
      </div>

      {industries.length > 0 && (
        <div className="mt-4 flex h-1.5 overflow-hidden rounded-full">
          {industries.map((ind) => (
            <span key={ind.slug} className="flex-1" style={{ background: getIndustryColor(ind.slug) }} />
          ))}
        </div>
      )}

      <nav className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {industries.map((ind) => (
          <Link
            key={ind.slug}
            href={`/industry/${ind.slug}`}
            className="flex items-center gap-2 whitespace-nowrap rounded border border-border px-2.5 py-1.5 font-mono text-xs text-text-muted transition-colors hover:border-text-muted hover:text-text"
          >
            <span
              className="h-3.5 w-[3px] flex-none rounded-sm"
              style={{ background: getIndustryColor(ind.slug) }}
            />
            {ind.name}
          </Link>
        ))}
      </nav>
    </header>
  );
}

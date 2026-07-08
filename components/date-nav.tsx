import Link from "next/link";
import { DatePicker } from "@/components/date-picker";

export function DateNav({ date, dates }: { date: string; dates: string[] }) {
  // dates is newest-first; "prev" = older digest, "next" = newer digest.
  const idx = dates.indexOf(date);
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;
  const newer = idx > 0 ? dates[idx - 1] : null;
  const latest = dates[0];

  return (
    <div className="mb-8 flex items-center gap-3 font-mono text-xs uppercase tracking-wide">
      {older ? (
        <Link href={`/d/${older}`} className="text-text-muted transition-colors hover:text-accent">
          ← {older}
        </Link>
      ) : (
        <span className="text-border">← older</span>
      )}
      <DatePicker current={date} />
      {newer ? (
        <Link href={`/d/${newer}`} className="text-text-muted transition-colors hover:text-accent">
          {newer} →
        </Link>
      ) : (
        <span className="text-border">newer →</span>
      )}
      {date !== latest && latest && (
        <Link href="/" className="ml-auto text-accent underline underline-offset-2 hover:no-underline">
          Latest
        </Link>
      )}
    </div>
  );
}

import Link from "next/link";
import { DatePicker } from "@/components/date-picker";

export function DateNav({ date, dates }: { date: string; dates: string[] }) {
  // dates is newest-first; "prev" = older digest, "next" = newer digest.
  const idx = dates.indexOf(date);
  const older = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;
  const newer = idx > 0 ? dates[idx - 1] : null;
  const latest = dates[0];

  return (
    <div className="mb-8 flex items-center gap-3 text-sm">
      {older ? (
        <Link href={`/d/${older}`} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          ← {older}
        </Link>
      ) : (
        <span className="text-neutral-300 dark:text-neutral-700">← older</span>
      )}
      <DatePicker current={date} />
      {newer ? (
        <Link href={`/d/${newer}`} className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
          {newer} →
        </Link>
      ) : (
        <span className="text-neutral-300 dark:text-neutral-700">newer →</span>
      )}
      {date !== latest && latest && (
        <Link href="/" className="ml-auto text-neutral-500 underline hover:text-neutral-900 dark:hover:text-neutral-100">
          Latest
        </Link>
      )}
    </div>
  );
}

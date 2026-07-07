import { DigestView } from "@/components/digest-view";
import { getDigestDates } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const dates = await getDigestDates();
  if (dates.length === 0) {
    return (
      <main>
        <p className="text-neutral-500">
          No digests yet. Once the daily pipeline runs, they&apos;ll land here.
        </p>
      </main>
    );
  }
  return <DigestView date={dates[0]} dates={dates} isLatest />;
}

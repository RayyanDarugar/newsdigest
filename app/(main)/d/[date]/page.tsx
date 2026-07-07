import { notFound } from "next/navigation";
import { DigestView } from "@/components/digest-view";
import { getDigestDates } from "@/lib/queries";
import { isValidDigestDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function DigestByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidDigestDate(date)) notFound();
  const dates = await getDigestDates();
  return <DigestView date={date} dates={dates} />;
}

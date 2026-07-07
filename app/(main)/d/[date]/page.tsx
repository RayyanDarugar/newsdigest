import { notFound } from "next/navigation";
import { DigestView } from "@/components/digest-view";
import { getDigestDates } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DigestByDatePage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const dates = await getDigestDates();
  return <DigestView date={date} dates={dates} />;
}

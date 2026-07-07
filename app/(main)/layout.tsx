import Link from "next/link";
import { getActiveIndustries } from "@/lib/queries";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const industries = await getActiveIndustries();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-8 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="flex items-baseline justify-between gap-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Industry Digest
          </Link>
        </div>
        <nav className="mt-2 flex gap-x-3 gap-y-1 overflow-x-auto text-sm text-neutral-500 dark:text-neutral-400">
          {industries.map((ind) => (
            <Link
              key={ind.slug}
              href={`/industry/${ind.slug}`}
              className="whitespace-nowrap hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {ind.name}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

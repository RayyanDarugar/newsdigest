"use client";

import { useRouter } from "next/navigation";

export function DatePicker({ current }: { current: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      defaultValue={current}
      onChange={(e) => {
        if (e.target.value) router.push(`/d/${e.target.value}`);
      }}
      className="rounded-md border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
      aria-label="Jump to date"
    />
  );
}

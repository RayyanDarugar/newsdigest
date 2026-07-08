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
      className="rounded border border-border bg-transparent px-2 py-1 font-mono text-xs text-text focus:border-accent focus:outline-none"
      aria-label="Jump to date"
    />
  );
}

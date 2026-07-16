"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RegenerateButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/entries/${entryId}/deep-dive`, {
        method: "DELETE",
      });
      if (res.ok) router.refresh();
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={regenerate}
      disabled={busy}
      className="rounded border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-text-muted transition-colors hover:border-text-muted hover:text-text disabled:opacity-50"
    >
      {busy ? "Clearing…" : "Regenerate"}
    </button>
  );
}

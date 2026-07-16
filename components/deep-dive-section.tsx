"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { ANGLES_DELIMITER } from "@/lib/deepdive/prompt";

export function DeepDiveSection({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"generating" | "error">("generating");
  const started = useRef(false);

  async function run() {
    setStatus("generating");
    setText("");
    try {
      const res = await fetch(`/api/entries/${entryId}/deep-dive`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Cache hit race: another tab generated it first.
      if (res.headers.get("content-type")?.includes("application/json")) {
        router.refresh();
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setText((t) => t + decoder.decode(value, { stream: true }));
      }
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anglesIdx = text.indexOf(ANGLES_DELIMITER);
  const visible = anglesIdx === -1 ? text : text.slice(0, anglesIdx);

  if (status === "error") {
    return (
      <div className="rounded border border-border bg-surface p-5">
        <p className="text-sm text-text-muted">
          The deep dive failed to generate.
        </p>
        <button
          onClick={run}
          className="mt-3 rounded bg-accent px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wide text-accent-contrast transition-opacity hover:opacity-90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-surface p-5">
      <p className="mb-4 flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-accent">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
        Generating deep dive — searching the web and writing…
      </p>
      {visible ? (
        <Markdown>{visible}</Markdown>
      ) : (
        <p className="text-sm text-text-muted">Warming up…</p>
      )}
    </div>
  );
}

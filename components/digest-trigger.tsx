"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 15_000;
const MAX_POLLS = 60; // ~15 minutes

type Status =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "polling"; attempt: number }
  | { phase: "done"; items: number; entries: number }
  | { phase: "already_done" }
  | { phase: "timed_out" }
  | { phase: "error"; message: string };

export function DigestTrigger() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function poll(attempt: number) {
    if (attempt > MAX_POLLS) {
      setStatus({ phase: "timed_out" });
      return;
    }
    setStatus({ phase: "polling", attempt });
    try {
      const res = await fetch("/api/cron/digest/finish", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setStatus({ phase: "error", message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      if (body.status === "done") {
        setStatus({ phase: "done", items: body.items, entries: body.entries });
        router.refresh();
        return;
      }
      if (body.status === "already_done") {
        setStatus({ phase: "already_done" });
        return;
      }
      // status === "pending" — check again shortly
      timerRef.current = setTimeout(() => poll(attempt + 1), POLL_INTERVAL_MS);
    } catch {
      setStatus({ phase: "error", message: "network error while polling" });
    }
  }

  async function run() {
    setStatus({ phase: "starting" });
    try {
      const res = await fetch("/api/cron/digest/start", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus({ phase: "error", message: body.error ?? `HTTP ${res.status}` });
        return;
      }
      poll(1);
    } catch {
      setStatus({ phase: "error", message: "network error while starting" });
    }
  }

  const busy = status.phase === "starting" || status.phase === "polling";

  return (
    <div className="max-w-2xl rounded border border-border bg-surface px-4 py-3.5">
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={busy}
          className="rounded bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Running…" : "Run digest now"}
        </button>
        <StatusLine status={status} />
      </div>
      <p className="mt-2.5 text-xs text-text-muted">
        Kicks off today&rsquo;s scrape (reddit via Apify, news, market) and
        waits for it to finish — usually a few minutes. Safe to leave this
        page; re-running later just checks status if a digest already exists
        for today.
      </p>
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  switch (status.phase) {
    case "idle":
      return null;
    case "starting":
      return <span className="font-mono text-xs text-text-muted">Starting reddit scrape…</span>;
    case "polling":
      return (
        <span className="font-mono text-xs text-text-muted">
          Waiting on the scrape (check {status.attempt}/{MAX_POLLS})…
        </span>
      );
    case "done":
      return (
        <span className="font-mono text-xs text-accent">
          Done — {status.items} items, {status.entries} entries.
        </span>
      );
    case "already_done":
      return (
        <span className="font-mono text-xs text-text-muted">
          Today&rsquo;s digest already exists.
        </span>
      );
    case "timed_out":
      return (
        <span className="font-mono text-xs text-down">
          Still not ready after ~15 minutes — check the Apify run, then press the button again.
        </span>
      );
    case "error":
      return <span className="font-mono text-xs text-down">Error: {status.message}</span>;
  }
}

"use client";

import { useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function EntryChat({
  entryId,
  enabled,
}: {
  entryId: string;
  enabled: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const lastSent = useRef<ChatMessage[]>([]);

  async function send(history: ChatMessage[]) {
    setBusy(true);
    setError(false);
    lastSent.current = history;
    setMessages([...history, { role: "assistant", content: "" }]);
    try {
      const res = await fetch(`/api/entries/${entryId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        const current = reply;
        setMessages([...history, { role: "assistant", content: current }]);
      }
      if (!reply) throw new Error("empty reply");
    } catch {
      setMessages(history);
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) return;
    setInput("");
    send([...messages, { role: "user", content: trimmed }]);
  }

  if (!enabled) {
    return (
      <p className="rounded border border-dashed border-border p-4 text-sm text-text-muted">
        Chat unlocks once the deep dive finishes generating.
      </p>
    );
  }

  return (
    <div className="rounded border border-border bg-surface">
      <div className="max-h-[28rem] space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-text-muted">
            Ask anything about this story — implications, players, what&rsquo;s
            happened since. Conversation resets when you leave the page.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="ml-auto max-w-[85%] rounded bg-accent px-3 py-2 text-sm text-accent-contrast"
            >
              {m.content}
            </p>
          ) : (
            <div key={i} className="max-w-[95%] text-sm">
              {m.content ? (
                <Markdown>{m.content}</Markdown>
              ) : (
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              )}
            </div>
          ),
        )}
        {error && (
          <div className="rounded border border-border p-3 text-sm text-text-muted">
            That message failed.{" "}
            <button
              onClick={() => send(lastSent.current)}
              className="text-accent underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2 border-t border-border p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={busy ? "Thinking…" : "Ask about this story…"}
          disabled={busy}
          className="w-full rounded border border-border bg-bg px-3 py-2 font-mono text-sm text-text outline-none placeholder:text-text-muted focus:border-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wide text-accent-contrast transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { hasValidSession } from "@/lib/api-auth";
import {
  getDeepDive,
  getDigestById,
  getEntriesWithSources,
  getEntryWithSourcesById,
  getProfileBio,
} from "@/lib/queries";
import { buildChatSystemPrompt } from "@/lib/deepdive/prompt";
import {
  DIGEST_MODEL,
  getAnthropicClient,
  WEB_SEARCH_TOOL,
} from "@/lib/anthropic";

const MAX_HISTORY = 20;
const MAX_CONTINUATIONS = 3;

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const parsed = chatBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const history = parsed.data.messages.slice(-MAX_HISTORY);
  if (history[history.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "last message must be from the user" },
      { status: 422 },
    );
  }

  const { id } = await ctx.params;
  const entry = await getEntryWithSourcesById(id);
  if (!entry) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }
  const deepDive = await getDeepDive(id);
  if (!deepDive) {
    return NextResponse.json(
      { error: "deep dive not generated yet" },
      { status: 409 },
    );
  }

  const [digest, dayEntries, bio] = await Promise.all([
    getDigestById(entry.digest_id),
    getEntriesWithSources(entry.digest_id),
    getProfileBio(),
  ]);
  const system = buildChatSystemPrompt({
    entry,
    dayEntries,
    deepDiveSummary: deepDive.summary,
    bio,
    date: digest?.digest_date ?? "unknown",
  });

  const client = getAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messages: Anthropic.MessageParam[] = history;

        for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
          const msgStream = client.messages.stream({
            model: DIGEST_MODEL,
            max_tokens: 2000,
            system,
            tools: [WEB_SEARCH_TOOL],
            messages,
          });
          msgStream.on("text", (delta) => {
            controller.enqueue(encoder.encode(delta));
          });
          const final = await msgStream.finalMessage();
          // Server-side web search hit its iteration limit; resume.
          if (final.stop_reason === "pause_turn" && i < MAX_CONTINUATIONS) {
            messages.push({ role: "assistant", content: final.content });
            continue;
          }
          break;
        }

        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

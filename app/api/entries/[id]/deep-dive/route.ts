import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { hasValidSession } from "@/lib/api-auth";
import {
  deleteDeepDive,
  getDeepDive,
  getDigestById,
  getEntriesWithSources,
  getEntryWithSourcesById,
  getProfileBio,
  upsertDeepDive,
} from "@/lib/queries";
import { buildDeepDivePrompt } from "@/lib/deepdive/prompt";
import { extractCitedSources, parseDeepDive } from "@/lib/deepdive/parse";
import {
  DIGEST_MODEL,
  getAnthropicClient,
  WEB_SEARCH_TOOL,
} from "@/lib/anthropic";

const MAX_CONTINUATIONS = 3;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const entry = await getEntryWithSourcesById(id);
  if (!entry) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }

  const cached = await getDeepDive(id);
  if (cached) {
    return NextResponse.json({ cached: true, deepDive: cached });
  }

  const [digest, dayEntries, bio] = await Promise.all([
    getDigestById(entry.digest_id),
    getEntriesWithSources(entry.digest_id),
    getProfileBio(),
  ]);
  const { system, user } = buildDeepDivePrompt({
    entry,
    dayEntries,
    bio,
    date: digest?.digest_date ?? "unknown",
  });

  const client = getAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = "";
        const allContent: Anthropic.ContentBlock[] = [];
        const messages: Anthropic.MessageParam[] = [
          { role: "user", content: user },
        ];

        let lastStopReason: Anthropic.Message["stop_reason"] = null;
        for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
          const msgStream = client.messages.stream({
            model: DIGEST_MODEL,
            max_tokens: 8000,
            system,
            tools: [WEB_SEARCH_TOOL],
            messages,
          });
          msgStream.on("text", (delta) => {
            fullText += delta;
            controller.enqueue(encoder.encode(delta));
          });
          const final = await msgStream.finalMessage();
          allContent.push(...final.content);
          lastStopReason = final.stop_reason;
          // Server-side web search hit its iteration limit; resume.
          if (final.stop_reason === "pause_turn" && i < MAX_CONTINUATIONS) {
            messages.push({ role: "assistant", content: final.content });
            continue;
          }
          break;
        }

        if (lastStopReason === "pause_turn") {
          throw new Error(
            "generation did not complete after maximum continuations",
          );
        }

        const { summary, angles } = parseDeepDive(fullText);
        await upsertDeepDive({
          entry_id: id,
          summary,
          angles,
          sources_used: extractCitedSources(allContent),
          model: DIGEST_MODEL,
        });
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

export async function DELETE(req: NextRequest, ctx: Ctx) {
  if (!(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const entry = await getEntryWithSourcesById(id);
  if (!entry) {
    return NextResponse.json({ error: "entry not found" }, { status: 404 });
  }
  await deleteDeepDive(id);
  return NextResponse.json({ ok: true });
}

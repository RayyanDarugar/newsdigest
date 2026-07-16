import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth";
import { POST } from "./route";

const ctx = { params: Promise.resolve({ id: "e1" }) };

function req(body: unknown, cookie?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", `digest_session=${cookie}`);
  return new NextRequest("http://localhost/api/entries/e1/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("chat route", () => {
  beforeEach(() => {
    process.env.COOKIE_SECRET = "test-secret";
  });

  it("rejects requests without a session", async () => {
    const res = await POST(req({ messages: [] }), ctx);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body with 422 before touching the DB", async () => {
    const token = await createSessionToken("test-secret");
    const res = await POST(req({ messages: [{ role: "bogus" }] }, token), ctx);
    expect(res.status).toBe(422);
  });

  it("rejects when the last message is not from the user", async () => {
    const token = await createSessionToken("test-secret");
    const res = await POST(
      req({ messages: [{ role: "assistant", content: "hi" }] }, token),
      ctx,
    );
    expect(res.status).toBe(422);
  });
});

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth";
import { hasValidSession } from "@/lib/api-auth";

const SECRET = "test-secret";

function reqWithCookie(token?: string): NextRequest {
  const headers = new Headers();
  if (token !== undefined) {
    headers.set("cookie", `digest_session=${token}`);
  }
  return new NextRequest("http://localhost/api/entries/x/deep-dive", {
    method: "POST",
    headers,
  });
}

describe("hasValidSession", () => {
  const original = process.env.COOKIE_SECRET;
  beforeEach(() => {
    process.env.COOKIE_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.COOKIE_SECRET = original;
  });

  it("accepts a valid session token", async () => {
    const token = await createSessionToken(SECRET);
    expect(await hasValidSession(reqWithCookie(token))).toBe(true);
  });

  it("rejects a missing cookie", async () => {
    expect(await hasValidSession(reqWithCookie())).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken("other-secret");
    expect(await hasValidSession(reqWithCookie(token))).toBe(false);
  });

  it("fails closed when COOKIE_SECRET is unset", async () => {
    const token = await createSessionToken(SECRET);
    delete process.env.COOKIE_SECRET;
    expect(await hasValidSession(reqWithCookie(token))).toBe(false);
  });
});

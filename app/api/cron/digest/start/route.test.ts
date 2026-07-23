import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth";

vi.mock("@/lib/digest/reddit", () => ({
  buildRedditStartUrls: () => ({ startUrls: [], subredditToIndustry: {} }),
  startRedditScrape: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "./route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/digest/start", { method: "POST", headers });
}

describe("POST /api/cron/digest/start auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.COOKIE_SECRET = "test-cookie-secret";
  });

  it("rejects requests without a valid cron secret or session", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("rejects requests with a logged-out session cookie", async () => {
    const res = await POST(req({ cookie: "digest_session=garbage" }));
    expect(res.status).toBe(401);
  });

  it("accepts requests with a valid session cookie even without a cron secret", async () => {
    delete process.env.CRON_SECRET;
    const token = await createSessionToken("test-cookie-secret");
    const res = await POST(req({ cookie: `digest_session=${token}` }));
    expect(res.status).toBe(202);
  });
});

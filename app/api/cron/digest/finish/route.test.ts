import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth";

vi.mock("@/lib/queries", () => ({
  getDigestByDate: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/digest/reddit", () => ({
  buildRedditStartUrls: () => ({ startUrls: [], subredditToIndustry: {} }),
  checkRedditRun: vi.fn().mockResolvedValue({ ready: false }),
  shapeRedditItems: () => [],
}));

import { POST } from "./route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/digest/finish", { method: "POST", headers });
}

describe("POST /api/cron/digest/finish auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.COOKIE_SECRET = "test-cookie-secret";
  });

  it("rejects requests without a valid cron secret or session", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("accepts requests with a valid session cookie even without a cron secret", async () => {
    delete process.env.CRON_SECRET;
    const token = await createSessionToken("test-cookie-secret");
    const res = await POST(req({ cookie: `digest_session=${token}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "pending" });
  });
});

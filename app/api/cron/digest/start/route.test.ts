import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionToken } from "@/lib/auth";

const { mockStartRedditScrape, mockGetDigestByDate } = vi.hoisted(() => ({
  mockStartRedditScrape: vi.fn().mockResolvedValue(undefined),
  mockGetDigestByDate: vi.fn(),
}));

vi.mock("@/lib/digest/reddit", () => ({
  buildRedditStartUrls: () => ({ startUrls: [], subredditToIndustry: {} }),
  startRedditScrape: mockStartRedditScrape,
}));

vi.mock("@/lib/queries", () => ({
  getDigestByDate: mockGetDigestByDate,
}));

import { POST } from "./route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/digest/start", { method: "POST", headers });
}

describe("POST /api/cron/digest/start auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.COOKIE_SECRET = "test-cookie-secret";
    mockStartRedditScrape.mockClear();
    mockGetDigestByDate.mockReset().mockResolvedValue(null);
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

  it("does not start a reddit scrape when today's digest already exists", async () => {
    mockGetDigestByDate.mockResolvedValue({ id: "d1", digest_date: "2026-07-23", created_at: "" });
    const res = await POST(req({ authorization: "Bearer test-cron-secret" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "already_done" });
    expect(mockStartRedditScrape).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/digest/start", { method: "POST", headers });
}

describe("POST /api/cron/digest/start auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("rejects requests without a valid cron secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });
});

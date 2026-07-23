import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/cron/digest/finish", { method: "POST" });
}

describe("POST /api/cron/digest/finish auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  it("rejects requests without a valid cron secret", async () => {
    const res = await POST(req());
    expect(res.status).toBe(401);
  });
});

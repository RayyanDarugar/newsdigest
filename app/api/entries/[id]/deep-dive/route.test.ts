import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, POST } from "./route";

function req(method: string): NextRequest {
  return new NextRequest("http://localhost/api/entries/e1/deep-dive", {
    method,
  });
}
const ctx = { params: Promise.resolve({ id: "e1" }) };

describe("deep-dive route auth", () => {
  beforeEach(() => {
    process.env.COOKIE_SECRET = "test-secret";
  });

  it("POST rejects requests without a session", async () => {
    const res = await POST(req("POST"), ctx);
    expect(res.status).toBe(401);
  });

  it("DELETE rejects requests without a session", async () => {
    const res = await DELETE(req("DELETE"), ctx);
    expect(res.status).toBe(401);
  });
});

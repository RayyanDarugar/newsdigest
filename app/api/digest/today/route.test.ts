import { describe, expect, it, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "./route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/digest/today", { method: "DELETE" });
}

describe("DELETE /api/digest/today auth", () => {
  beforeEach(() => {
    process.env.COOKIE_SECRET = "test-secret";
  });

  it("rejects requests without a session", async () => {
    const res = await DELETE(req());
    expect(res.status).toBe(401);
  });
});

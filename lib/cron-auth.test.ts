import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { hasValidCronSecret } from "@/lib/cron-auth";

function reqWithAuth(header?: string): NextRequest {
  const headers = new Headers();
  if (header !== undefined) headers.set("authorization", header);
  return new NextRequest("http://localhost/api/cron/digest/start", { method: "POST", headers });
}

describe("hasValidCronSecret", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it("accepts a matching bearer token", () => {
    expect(hasValidCronSecret(reqWithAuth("Bearer test-cron-secret"))).toBe(true);
  });

  it("rejects a missing authorization header", () => {
    expect(hasValidCronSecret(reqWithAuth())).toBe(false);
  });

  it("rejects a non-matching token", () => {
    expect(hasValidCronSecret(reqWithAuth("Bearer wrong-token"))).toBe(false);
  });

  it("fails closed when CRON_SECRET is unset", () => {
    delete process.env.CRON_SECRET;
    expect(hasValidCronSecret(reqWithAuth("Bearer test-cron-secret"))).toBe(false);
  });
});

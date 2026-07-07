import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken, safeEqual } from "@/lib/auth";

const SECRET = "test-secret";

describe("session tokens", () => {
  it("round-trips a valid token", async () => {
    const token = await createSessionToken(SECRET);
    expect(await verifySessionToken(token, SECRET)).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken("other-secret");
    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });

  it("rejects a tampered expiry", async () => {
    const token = await createSessionToken(SECRET);
    const [exp, sig] = token.split(".");
    expect(await verifySessionToken(`${Number(exp) + 1}.${sig}`, SECRET)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const past = Date.now() - 400 * 24 * 60 * 60 * 1000; // 400 days ago
    const token = await createSessionToken(SECRET, past);
    expect(await verifySessionToken(token, SECRET)).toBe(false);
  });

  it("rejects undefined and malformed tokens", async () => {
    expect(await verifySessionToken(undefined, SECRET)).toBe(false);
    expect(await verifySessionToken("", SECRET)).toBe(false);
    expect(await verifySessionToken("garbage", SECRET)).toBe(false);
    expect(await verifySessionToken("123.", SECRET)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("matches equal strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });
  it("rejects different strings and different lengths", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "a")).toBe(false);
  });
});

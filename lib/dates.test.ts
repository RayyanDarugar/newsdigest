import { describe, it, expect } from "vitest";
import { isValidDigestDate } from "@/lib/dates";

describe("isValidDigestDate", () => {
  it("accepts a valid date", () => {
    expect(isValidDigestDate("2026-07-07")).toBe(true);
  });

  it("rejects a calendar-invalid day", () => {
    expect(isValidDigestDate("2026-02-30")).toBe(false);
  });

  it("rejects a calendar-invalid month and day", () => {
    expect(isValidDigestDate("2026-13-45")).toBe(false);
  });

  it("rejects values that don't match the shape", () => {
    expect(isValidDigestDate("2026-2-3")).toBe(false);
  });

  it("accepts a leap day in a leap year", () => {
    expect(isValidDigestDate("2024-02-29")).toBe(true);
  });

  it("rejects a leap day in a non-leap year", () => {
    expect(isValidDigestDate("2023-02-29")).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(isValidDigestDate("not-a-date")).toBe(false);
    expect(isValidDigestDate("")).toBe(false);
  });
});

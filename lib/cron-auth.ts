import { NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";

export function hasValidCronSecret(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  const expected = process.env.CRON_SECRET;
  return Boolean(expected && token && safeEqual(token, expected));
}

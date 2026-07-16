import { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/auth";

// API routes are covered by the proxy matcher too, but a redirect-to-login is
// the wrong response for fetch() callers; routes use this to return 401.
export async function hasValidSession(req: NextRequest): Promise<boolean> {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) return false;
  const token = req.cookies.get("digest_session")?.value;
  return verifySessionToken(token, secret);
}

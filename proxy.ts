import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const secret = process.env.COOKIE_SECRET;
  const token = req.cookies.get("digest_session")?.value;
  // Never verify against an empty-string secret: if COOKIE_SECRET is
  // missing, fail closed by treating the request as unauthenticated.
  const ok = secret ? await verifySessionToken(token, secret) : false;
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except: login page, ingest API (bearer-authed), Next static
    // assets, and public files.
    "/((?!login|api/ingest|_next/static|_next/image|favicon.ico|robots.txt).*)",
  ],
};

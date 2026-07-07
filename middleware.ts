import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("digest_session")?.value;
  const ok = await verifySessionToken(token, process.env.COOKIE_SECRET ?? "");
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

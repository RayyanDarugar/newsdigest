"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, safeEqual } from "@/lib/auth";

const YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.APP_PASSWORD;
  if (!expected || !safeEqual(password, expected)) {
    redirect("/login?error=1");
  }
  const token = await createSessionToken(process.env.COOKIE_SECRET!);
  (await cookies()).set("digest_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: YEAR_SECONDS,
    path: "/",
  });
  redirect("/");
}

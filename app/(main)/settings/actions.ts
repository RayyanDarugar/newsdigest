"use server";

import { redirect } from "next/navigation";
import { saveProfileBio } from "@/lib/queries";

export async function saveBio(formData: FormData) {
  const bio = String(formData.get("bio") ?? "");
  await saveProfileBio(bio);
  redirect("/settings?saved=1");
}

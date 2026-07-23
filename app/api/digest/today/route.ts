import { NextRequest, NextResponse } from "next/server";
import { hasValidSession } from "@/lib/api-auth";
import { deleteDigestByDate } from "@/lib/queries";
import { todayISO } from "@/lib/dates";

export async function DELETE(req: NextRequest) {
  if (!(await hasValidSession(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const date = todayISO();
  await deleteDigestByDate(date);

  return NextResponse.json({ ok: true, date });
}

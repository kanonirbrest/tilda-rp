import { NextResponse } from "next/server";
import { listPrintRegistrationTimes } from "@/lib/print-ticket-slots";

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date")?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "DATE_REQUIRED", hint: "Укажите date в формате YYYY-MM-DD" }, { status: 400 });
  }
  const data = await listPrintRegistrationTimes(date);
  return NextResponse.json(data);
}

import { NextResponse } from "next/server";
import { listPrintRegistrationDays } from "@/lib/print-ticket-slots";

export async function GET() {
  const data = await listPrintRegistrationDays();
  return NextResponse.json(data);
}

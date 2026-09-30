import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { SLOT_CAPACITY, listRegistrations } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const items = await listRegistrations();
    return NextResponse.json(
      { capacity: SLOT_CAPACITY, items },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Stockage indisponible" }, { status: 503 });
  }
}

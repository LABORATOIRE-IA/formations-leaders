import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { MAX_REGISTRATIONS, listRegistrations } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const items = await listRegistrations();
    return NextResponse.json(
      {
        max: MAX_REGISTRATIONS,
        count: items.length,
        remaining: Math.max(0, MAX_REGISTRATIONS - items.length),
        items,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "Base de données indisponible" }, { status: 503 });
  }
}

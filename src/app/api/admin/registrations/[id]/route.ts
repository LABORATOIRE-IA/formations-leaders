import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deleteRegistration } from "@/lib/store";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });
  const ok = await deleteRegistration(n);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

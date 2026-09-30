import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { adminRemove } from "@/lib/store";

export const runtime = "nodejs";

/** id = "<créneau>~<numéro de place>", par exemple "jeu-1400~3" */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const { id } = await ctx.params;
  const [slot, seat] = decodeURIComponent(id).split("~");
  const ok = await adminRemove(slot, Number(seat));
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

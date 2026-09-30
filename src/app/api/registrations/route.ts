import { NextResponse } from "next/server";
import { SLOT_CAPACITY, cancel, register, slotCounts, verifyMine } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** État public : places prises par créneau. Si l'en-tête de l'inscrit est fourni, vérifie qu'elle existe toujours. */
export async function GET(req: Request) {
  try {
    const counts = await slotCounts();
    const slot = req.headers.get("x-slot");
    const seat = req.headers.get("x-seat");
    const token = req.headers.get("x-token");
    const body: Record<string, unknown> = { capacity: SLOT_CAPACITY, counts };
    if (slot && seat && token) body.mine = await verifyMine(slot, Number(seat), token);
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Service indisponible" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const slot = clean(body.slot, 40);
  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = clean(body.email, 160).toLowerCase();
  const company = clean(body.company, 120);

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "Prénom et nom sont requis." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }

  try {
    const res = await register({ slot, firstName, lastName, email, company });
    if (!res.ok) {
      if (res.reason === "full") {
        return NextResponse.json({ error: "Ce créneau est complet.", full: true }, { status: 409 });
      }
      if (res.reason === "invalid_slot") {
        return NextResponse.json({ error: "Créneau inconnu." }, { status: 400 });
      }
      return NextResponse.json({ error: "Cet e-mail est déjà inscrit à un créneau." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, slot: res.slot, seat: res.seat, token: res.token }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur serveur, réessayez dans un instant." }, { status: 500 });
  }
}

/** Annulation par l'inscrit (jeton reçu à l'inscription). */
export async function DELETE(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {}
  const ok = await cancel(clean(body.slot, 40), Number(body.seat), clean(body.token, 200));
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

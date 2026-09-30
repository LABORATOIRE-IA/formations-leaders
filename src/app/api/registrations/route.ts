import { NextResponse } from "next/server";
import { MAX_REGISTRATIONS, countRegistrations, register } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function GET() {
  try {
    const count = await countRegistrations();
    return NextResponse.json(
      { max: MAX_REGISTRATIONS, count, remaining: Math.max(0, MAX_REGISTRATIONS - count) },
      { headers: { "Cache-Control": "no-store" } }
    );
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

  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = clean(body.email, 160).toLowerCase();
  const company = clean(body.company, 120);
  const note = clean(body.note, 500);

  if (!firstName || !lastName) {
    return NextResponse.json({ error: "Prénom et nom sont requis." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }

  try {
    const res = await register({ firstName, lastName, email, company, note });
    if (!res.ok) {
      if (res.reason === "full") {
        return NextResponse.json({ error: "Désolé, toutes les places sont prises.", full: true }, { status: 409 });
      }
      return NextResponse.json({ error: "Cet e-mail est déjà inscrit." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, remaining: res.remaining }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erreur serveur, réessayez dans un instant." }, { status: 500 });
  }
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DAYS, SLOTS, type SlotDef } from "@/lib/slots";

type Mine = { slot: string; seat: number; token: string; name: string };
const LS_KEY = "vibecode-registration";

function loadMine(): Mine | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Mine) : null;
  } catch {
    return null;
  }
}
function saveMine(m: Mine | null) {
  try {
    if (m) localStorage.setItem(LS_KEY, JSON.stringify(m));
    else localStorage.removeItem(LS_KEY);
  } catch {}
}

export default function Home() {
  const [capacity, setCapacity] = useState(20);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const [mine, setMine] = useState<Mine | null>(null);
  const mineRef = useRef<Mine | null>(null);
  const [target, setTarget] = useState<SlotDef | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setMineBoth = (m: Mine | null) => {
    mineRef.current = m;
    setMine(m);
    saveMine(m);
  };

  const refresh = useCallback(async () => {
    try {
      const m = mineRef.current;
      const headers: Record<string, string> = {};
      if (m) {
        headers["x-slot"] = m.slot;
        headers["x-seat"] = String(m.seat);
        headers["x-token"] = m.token;
      }
      const r = await fetch("/api/registrations", { cache: "no-store", headers });
      if (!r.ok) return;
      const d = await r.json();
      setCapacity(d.capacity);
      setCounts(d.counts);
      if (m && d.mine === false) setMineBoth(null); // supprimée par l'admin
      setReady(true);
    } catch {}
  }, []);

  useEffect(() => {
    const m = loadMine();
    mineRef.current = m;
    setMine(m);
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, FormDataEntryValue> = { ...Object.fromEntries(fd.entries()), slot: target.id };
    try {
      const r = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Une erreur est survenue.");
        refresh();
      } else {
        setMineBoth({
          slot: d.slot,
          seat: d.seat,
          token: d.token,
          name: `${String(payload.firstName)} ${String(payload.lastName)}`.trim(),
        });
        setTarget(null);
        refresh();
      }
    } catch {
      setError("Connexion impossible, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelMine() {
    const m = mineRef.current;
    if (!m || !confirm("Annuler votre inscription ?")) return;
    await fetch("/api/registrations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: m.slot, seat: m.seat, token: m.token }),
    });
    setMineBoth(null);
    refresh();
  }

  return (
    <main className="wrap">
      <header className="brand">
        <div className="logo">
          ailab<i>.</i>
        </div>
        <div className="tag">by onepoint · agentic studio</div>
      </header>

      <h1 className="title">
        Formation à l’offre du Lab
        <br />
        <span className="grad">15 &amp; 16 octobre</span>
      </h1>
      <p className="lead">
        Réservez votre créneau : une session pour préparer vos pitchs clients.
        <br />
        Sessions de <b>45 minutes</b>, <b>{capacity} places</b> par créneau.
      </p>

      <div className="days">
        {DAYS.map((day) => (
          <section className="card" key={day.key}>
            <div className="card-head">
              <strong>{day.label.toUpperCase()}</strong>
              <span>{day.date}</span>
            </div>

            {SLOTS.filter((s) => s.day === day.key).map((s) => {
              const count = counts[s.id] ?? 0;
              const remaining = Math.max(0, capacity - count);
              const full = ready && remaining === 0;
              const isMine = mine?.slot === s.id;
              const pct = Math.min(100, (count / capacity) * 100);
              const pill = !ready
                ? "…"
                : full
                ? "complet"
                : `${remaining} place${remaining > 1 ? "s" : ""} restante${remaining > 1 ? "s" : ""}`;

              return (
                <div className="slot" key={s.id}>
                  <div className="slot-top">
                    <div className="time">
                      {s.start}
                      <em>→</em>
                      {s.end}
                    </div>
                    <span className={full ? "pill full" : remaining <= 5 && ready ? "pill warn" : "pill"}>{pill}</span>
                  </div>

                  <div className="bar" aria-hidden>
                    <div style={{ width: `${pct}%` }} />
                  </div>

                  {isMine ? (
                    <>
                      <div className="mine">
                        <span className="chk">✓</span>
                        Inscrit(e) — {mine?.name}
                      </div>
                      <button className="btn-out" onClick={cancelMine}>
                        Annuler mon inscription
                      </button>
                    </>
                  ) : mine ? (
                    <div className="dis">Déjà inscrit(e) à un autre créneau</div>
                  ) : full ? (
                    <div className="dis">Créneau complet</div>
                  ) : (
                    <button
                      className="btn"
                      disabled={!ready}
                      onClick={() => {
                        setError(null);
                        setTarget(s);
                      }}
                    >
                      Je m’inscris →
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <div className="foot">
        <a className="pilot" href="/admin">
          Mode pilotage
        </a>
      </div>

      {target && (
        <div className="overlay" onClick={() => !busy && setTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <div className="k">Je m’inscris</div>
                <div className="m-title">
                  {DAYS.find((d) => d.key === target.day)?.label} {DAYS.find((d) => d.key === target.day)?.date.replace(" 2026", "")} ·{" "}
                  {target.start} → {target.end}
                </div>
              </div>
              <button className="x" onClick={() => setTarget(null)} aria-label="Fermer">
                ×
              </button>
            </div>
            <form className="f" onSubmit={submit}>
              <div className="row2">
                <label>
                  Prénom
                  <input name="firstName" required maxLength={80} autoComplete="given-name" autoFocus />
                </label>
                <label>
                  Nom
                  <input name="lastName" required maxLength={80} autoComplete="family-name" />
                </label>
              </div>
              <label>
                E-mail
                <input name="email" type="email" required maxLength={160} autoComplete="email" />
              </label>
              <label>
                Entreprise / équipe (optionnel)
                <input name="company" maxLength={120} autoComplete="organization" />
              </label>
              {error && <div className="msg err">{error}</div>}
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Inscription…" : "Confirmer mon inscription"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

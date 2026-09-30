"use client";

import { useCallback, useEffect, useState } from "react";

type Status = { max: number; count: number; remaining: number };

const TITLE = process.env.NEXT_PUBLIC_EVENT_TITLE || "Session Vibecode";
const DATE = process.env.NEXT_PUBLIC_EVENT_DATE || "";

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/registrations", { cache: "no-store" });
      if (r.ok) setStatus(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    try {
      const r = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Une erreur est survenue.");
        refresh();
      } else {
        setDone(String(payload.firstName));
        refresh();
      }
    } catch {
      setError("Connexion impossible, réessayez.");
    } finally {
      setLoading(false);
    }
  }

  const full = status ? status.remaining <= 0 : false;
  const pct = status ? Math.min(100, Math.round((status.count / status.max) * 100)) : 0;
  const pillClass = full ? "pill full" : status && status.remaining <= 5 ? "pill warn" : "pill";

  return (
    <main className="wrap narrow">
      <header className="brand">
        <div className="logo">
          ailab<i>.</i>
        </div>
        <div className="tag">by onepoint · agentic studio</div>
      </header>

      <h1 className="title">
        Atelier <span className="grad">Vibecode</span>
      </h1>
      <p className="lead">
        {TITLE}
        {DATE ? <> · <b>{DATE}</b></> : null}. Inscrivez-vous en quelques secondes.
        {status ? (
          <>
            {" "}
            <b>{status.max} places</b> au total.
          </>
        ) : null}
      </p>

      <section className="card" aria-live="polite">
        <div className="card-head">
          <strong>INSCRIPTION</strong>
          {status && <span className={pillClass}>{full ? "complet" : `${status.remaining} place${status.remaining > 1 ? "s" : ""} restante${status.remaining > 1 ? "s" : ""}`}</span>}
        </div>

        {status && (
          <div className="bar" aria-hidden>
            <div style={{ width: `${pct}%` }} />
          </div>
        )}

        {done ? (
          <div className="success">
            <div className="check">✓</div>
            <h2>C’est noté, {done} !</h2>
            <p>Votre place est réservée. À très bientôt.</p>
          </div>
        ) : full ? (
          <div className="msg err">Toutes les places sont prises. Merci de votre intérêt !</div>
        ) : (
          <form className="f" onSubmit={onSubmit}>
            <div className="row2">
              <label>
                Prénom
                <input name="firstName" required maxLength={80} autoComplete="given-name" />
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
              Entreprise / équipe
              <input name="company" maxLength={120} autoComplete="organization" />
            </label>
            <label>
              Un mot pour nous (optionnel)
              <textarea name="note" maxLength={500} placeholder="Attentes, projet à prototyper, contraintes…" />
            </label>
            {error && <div className="msg err">{error}</div>}
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Inscription…" : "Réserver ma place →"}
            </button>
          </form>
        )}
      </section>

      <div className="foot">
        <a href="/admin">Espace administrateur</a>
      </div>
    </main>
  );
}

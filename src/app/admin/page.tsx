"use client";

import { useCallback, useEffect, useState } from "react";

type Item = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  note: string | null;
  created_at: string;
};
type Data = { max: number; count: number; remaining: number; items: Item[] };

export default function Admin() {
  const [data, setData] = useState<Data | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/registrations", { cache: "no-store" });
      if (r.status === 401) {
        setAuthed(false);
        return;
      }
      if (r.ok) {
        setData(await r.json());
        setAuthed(true);
        setUpdated(new Date());
      }
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Suivi quasi temps réel : rafraîchissement toutes les 3 s
  useEffect(() => {
    if (!authed) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [authed, load]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    if (r.ok) {
      setPwd("");
      load();
    } else {
      setErr((await r.json()).error || "Erreur");
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setData(null);
    setAuthed(false);
  }

  async function remove(it: Item) {
    if (!confirm(`Supprimer ${it.first_name} ${it.last_name} ?`)) return;
    await fetch(`/api/admin/registrations/${it.id}`, { method: "DELETE" });
    load();
  }

  if (authed === null) return <main className="wrap" />;

  if (!authed) {
    return (
      <main className="wrap narrow">
        <header className="brand">
          <div className="logo">
            ailab<i>.</i>
          </div>
          <div className="tag">espace administrateur</div>
        </header>
        <section className="card">
          <form className="f" onSubmit={login}>
            <label>
              Mot de passe
              <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus required />
            </label>
            {err && <div className="msg err">{err}</div>}
            <button className="btn" type="submit">Se connecter</button>
          </form>
        </section>
        <div className="foot"><a href="/">← Retour à l’inscription</a></div>
      </main>
    );
  }

  const fmt = (s: string) =>
    new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="wrap">
      <div className="topbar">
        <h1>
          Inscrits <span className="grad">Vibecode</span>
        </h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="live">
            <i /> temps réel{updated ? ` · ${updated.toLocaleTimeString("fr-FR")}` : ""}
          </span>
          <a className="btn ghost" href="/" style={{ textDecoration: "none" }}>Page publique</a>
          <button className="btn ghost" onClick={logout}>Déconnexion</button>
        </div>
      </div>

      {data && (
        <>
          <div className="stats">
            <div className="stat"><div className="k">Inscrits</div><div className="v">{data.count}</div></div>
            <div className="stat"><div className="k">Places restantes</div><div className="v">{data.remaining}</div></div>
            <div className="stat"><div className="k">Capacité</div><div className="v">{data.max}</div></div>
          </div>
          <div className="bar"><div style={{ width: `${Math.min(100, (data.count / data.max) * 100)}%` }} /></div>

          <div className="table">
            <div className="tr th">
              <span>#</span><span>Nom</span><span>E-mail</span><span>Entreprise</span><span>Inscrit le</span><span />
            </div>
            {data.items.length === 0 ? (
              <div className="empty">Aucune inscription pour le moment.</div>
            ) : (
              data.items.map((it, i) => (
                <div key={it.id} style={{ display: "contents" }}>
                  <div className="tr" style={it.note ? { borderBottom: 0, paddingBottom: 4 } : undefined}>
                    <span className="n">{i + 1}</span>
                    <span className="name">{it.first_name} {it.last_name}</span>
                    <span className="mono email">{it.email}</span>
                    <span className="co">{it.company || "—"}</span>
                    <span className="mono date">{fmt(it.created_at)}</span>
                    <button className="btn danger" onClick={() => remove(it)}>Supprimer</button>
                  </div>
                  {it.note && (
                    <div className="tr" style={{ paddingTop: 0 }}>
                      <span />
                      <span className="note">“{it.note}”</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;
const PILOTAGE_CODE = process.env.PILOTAGE_CODE || 'PILOTAGE';
const CAP = 20;

const SLOTS = [
  { id: 'j15-1', day: 'Jeudi', date: '15 octobre 2026', start: '14:00', end: '14:45' },
  { id: 'j15-2', day: 'Jeudi', date: '15 octobre 2026', start: '14:45', end: '15:30' },
  { id: 'v16-1', day: 'Vendredi', date: '16 octobre 2026', start: '14:00', end: '14:45' },
  { id: 'v16-2', day: 'Vendredi', date: '16 octobre 2026', start: '14:45', end: '15:30' }
];
const slotIds = new Set(SLOTS.map(s => s.id));
const bySlot = Object.fromEntries(SLOTS.map(s => [s.id, s]));

function slugEmail(email) {
  return String(email).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'x';
}
function requirePilotage(req, res, next) {
  const code = req.get('x-pilotage-code') || req.query.code || '';
  if (code !== PILOTAGE_CODE) {
    return res.status(401).json({ error: 'Code pilotage invalide.' });
  }
  next();
}
// Petit filet de sécurité : si le verrou distant expire, on renvoie un 503
// clair plutôt qu'une erreur 500 opaque.
function handleStoreError(res, err) {
  if (err && err.code === 'LOCK_TIMEOUT') {
    return res.status(503).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur, réessayez." });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Diagnostic simple : indique si le stockage persistant (KV) est actif.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: store.useKv ? 'kv' : 'file' });
});

// Public: current slots + registration counts (no personal data leaked to non-admins)
app.get('/api/slots', async (req, res) => {
  try {
    const list = await store.readAll();
    const counts = Object.fromEntries(SLOTS.map(s => [s.id, 0]));
    list.forEach(r => { if (counts.hasOwnProperty(r.slotId)) counts[r.slotId]++; });
    res.json(SLOTS.map(s => ({ ...s, count: counts[s.id], cap: CAP })));
  } catch (err) { handleStoreError(res, err); }
});

// Public: my own registration, looked up by email (client keeps its own email in localStorage)
app.get('/api/my-registration', async (req, res) => {
  try {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) return res.json({ registration: null });
    const list = await store.readAll();
    const mine = list.find(r => r.email.toLowerCase() === email);
    res.json({ registration: mine || null });
  } catch (err) { handleStoreError(res, err); }
});

// Public: register (or move) for a slot
app.post('/api/registrations', async (req, res) => {
  const { name, email, bt, slotId } = req.body || {};
  if (!name || !email || !bt || !slotId) return res.status(400).json({ error: 'Champs manquants.' });
  if (!slotIds.has(slotId)) return res.status(400).json({ error: 'Créneau inconnu.' });

  try {
    const result = await store.withLock(async () => {
      const list = await store.readAll();
      const emailKey = email.trim().toLowerCase();
      const already = list.find(r => r.email.toLowerCase() === emailKey);
      const count = list.filter(r => r.slotId === slotId && r.email.toLowerCase() !== emailKey).length;
      if (count >= CAP) {
        return { status: 409, body: { error: 'Ce créneau est complet.' } };
      }
      const entry = {
        id: already ? already.id : (slotId + '__' + slugEmail(email) + '__' + crypto.randomBytes(3).toString('hex')),
        name: String(name).trim(),
        email: email.trim(),
        bt: String(bt).trim(),
        slotId,
        ts: new Date().toISOString()
      };
      const next = list.filter(r => r.email.toLowerCase() !== emailKey);
      next.push(entry);
      await store.writeAll(next);
      return { status: 200, body: { registration: entry } };
    });
    res.status(result.status).json(result.body);
  } catch (err) { handleStoreError(res, err); }
});

// Public: cancel my own registration
app.delete('/api/registrations/mine', async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email requis.' });
  try {
    await store.withLock(async () => {
      const list = await store.readAll();
      const next = list.filter(r => r.email.toLowerCase() !== email);
      await store.writeAll(next);
    });
    res.json({ ok: true });
  } catch (err) { handleStoreError(res, err); }
});

// Admin (pilotage code required): full roster
app.get('/api/admin/registrations', requirePilotage, async (req, res) => {
  try {
    res.json({ registrations: await store.readAll() });
  } catch (err) { handleStoreError(res, err); }
});

// Admin: delete any entry by id
app.delete('/api/admin/registrations/:id', requirePilotage, async (req, res) => {
  try {
    await store.withLock(async () => {
      const list = await store.readAll();
      const next = list.filter(r => r.id !== req.params.id);
      await store.writeAll(next);
    });
    res.json({ ok: true });
  } catch (err) { handleStoreError(res, err); }
});

// Admin: CSV export
app.get('/api/admin/export.csv', requirePilotage, async (req, res) => {
  try {
    const list = await store.readAll();
    const esc = v => {
      const s = String(v == null ? '' : v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = [['Jour', 'Date', 'Créneau', 'Nom', 'Email', 'Business Team', 'Horodatage']];
    list.forEach(r => {
      const s = bySlot[r.slotId] || {};
      rows.push([s.day || r.slotId, s.date || '', `${s.start || ''}–${s.end || ''}`, r.name, r.email, r.bt, r.ts]);
    });
    const csv = '﻿' + rows.map(row => row.map(esc).join(';')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inscriptions-formation-offre-lab.csv"');
    res.send(csv);
  } catch (err) { handleStoreError(res, err); }
});

// En local (npm start) on démarre un vrai serveur HTTP.
// Sur Vercel, ce fichier est importé comme une fonction serverless : on ne
// doit PAS appeler app.listen() (Vercel gère lui-même l'écoute réseau), on
// se contente d'exporter `app`.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Livepoint inscription server running on http://localhost:${PORT}`);
    console.log(`Stockage : ${store.useKv ? 'Vercel KV (persistant, partagé)' : 'fichier local data/registrations.json'}`);
  });
}

module.exports = app;

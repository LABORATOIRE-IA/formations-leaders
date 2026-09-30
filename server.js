const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const PILOTAGE_CODE = process.env.PILOTAGE_CODE || 'PILOTAGE';
const DATA_FILE = path.join(__dirname, 'data', 'registrations.json');
const CAP = 20;

const SLOTS = [
  { id: 'j15-1', day: 'Jeudi', date: '15 octobre 2026', start: '14:00', end: '14:45' },
  { id: 'j15-2', day: 'Jeudi', date: '15 octobre 2026', start: '14:45', end: '15:30' },
  { id: 'v16-1', day: 'Vendredi', date: '16 octobre 2026', start: '14:00', end: '14:45' },
  { id: 'v16-2', day: 'Vendredi', date: '16 octobre 2026', start: '14:45', end: '15:30' }
];
const slotIds = new Set(SLOTS.map(s => s.id));
const bySlot = Object.fromEntries(SLOTS.map(s => [s.id, s]));

// --- tiny file-backed store (fine for ~80 rows; swap for a real DB in production) ---
function ensureStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}
function readAll() {
  ensureStore();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]'); }
  catch (e) { return []; }
}
function writeAll(list) {
  ensureStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}
// serialize writes so two near-simultaneous submissions can't both slip past the cap
let writeChain = Promise.resolve();
function withLock(fn) {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => {});
  return run;
}

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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Public: current slots + registration counts (no personal data leaked to non-admins)
app.get('/api/slots', (req, res) => {
  const list = readAll();
  const counts = Object.fromEntries(SLOTS.map(s => [s.id, 0]));
  list.forEach(r => { if (counts.hasOwnProperty(r.slotId)) counts[r.slotId]++; });
  res.json(SLOTS.map(s => ({ ...s, count: counts[s.id], cap: CAP })));
});

// Public: my own registration, looked up by email (client keeps its own email in localStorage)
app.get('/api/my-registration', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.json({ registration: null });
  const list = readAll();
  const mine = list.find(r => r.email.toLowerCase() === email);
  res.json({ registration: mine || null });
});

// Public: register (or move) for a slot
app.post('/api/registrations', (req, res) => {
  const { name, email, bt, slotId } = req.body || {};
  if (!name || !email || !bt || !slotId) return res.status(400).json({ error: 'Champs manquants.' });
  if (!slotIds.has(slotId)) return res.status(400).json({ error: 'Créneau inconnu.' });

  withLock(() => {
    const list = readAll();
    const emailKey = email.trim().toLowerCase();
    const already = list.find(r => r.email.toLowerCase() === emailKey);
    const count = list.filter(r => r.slotId === slotId && r.email.toLowerCase() !== emailKey).length;
    if (count >= CAP) {
      res.status(409).json({ error: 'Ce créneau est complet.' });
      return;
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
    writeAll(next);
    res.json({ registration: entry });
  });
});

// Public: cancel my own registration
app.delete('/api/registrations/mine', (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Email requis.' });
  withLock(() => {
    const list = readAll();
    const next = list.filter(r => r.email.toLowerCase() !== email);
    writeAll(next);
    res.json({ ok: true });
  });
});

// Admin (pilotage code required): full roster
app.get('/api/admin/registrations', requirePilotage, (req, res) => {
  res.json({ registrations: readAll() });
});

// Admin: delete any entry by id
app.delete('/api/admin/registrations/:id', requirePilotage, (req, res) => {
  withLock(() => {
    const list = readAll();
    const next = list.filter(r => r.id !== req.params.id);
    writeAll(next);
    res.json({ ok: true });
  });
});

// Admin: CSV export
app.get('/api/admin/export.csv', requirePilotage, (req, res) => {
  const list = readAll();
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
});

app.listen(PORT, () => {
  console.log(`Livepoint inscription server running on http://localhost:${PORT}`);
});

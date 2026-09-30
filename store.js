// Petite couche de stockage, avec deux modes :
//
//  - Mode "KV" (production / Vercel) : utilisé automatiquement dès que les
//    variables d'environnement KV_REST_API_URL / KV_REST_API_TOKEN existent
//    (elles sont injectées automatiquement quand on relie une base KV Vercel
//    au projet). Les données sont alors stockées dans cette base KV,
//    partagée par toutes les fonctions serverless — donc par tous les
//    utilisateurs, sur un vrai disque persistant.
//
//  - Mode "fichier" (développement local, ou hébergeur classique avec disque
//    persistant) : utilisé si les variables KV ne sont pas définies. C'est
//    l'ancien comportement (data/registrations.json), pratique pour tester
//    en local sans rien configurer.
//
// Dans les deux cas, `withLock` sérialise les écritures pour qu'une
// inscription ne puisse pas "doubler" une autre au même instant et faire
// dépasser le plafond de 20 places.

const fs = require('fs');
const path = require('path');

// Vercel propose désormais le stockage clé-valeur via une intégration Redis
// du Marketplace (Upstash). Selon la façon dont elle est reliée au projet,
// les variables d'environnement s'appellent KV_REST_API_URL/TOKEN (nom
// hérité de l'ancien "Vercel KV") ou UPSTASH_REDIS_REST_URL/TOKEN : on
// accepte les deux formes.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useKv = !!(REDIS_URL && REDIS_TOKEN);

let kv = null;
if (useKv) {
  // Chargé seulement si les variables Redis sont présentes, pour ne pas
  // exiger le package @upstash/redis en développement local.
  const { Redis } = require('@upstash/redis');
  kv = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
}

const DATA_FILE = path.join(__dirname, 'data', 'registrations.json');
const REG_KEY = 'livepoint:registrations';
const LOCK_KEY = 'livepoint:lock';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- mode fichier ---
function ensureFileStore() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}
function readFile() {
  ensureFileStore();
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8') || '[]'); }
  catch (e) { return []; }
}
function writeFile(list) {
  ensureFileStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2), 'utf8');
}
let localChain = Promise.resolve();
function withLocalLock(fn) {
  const run = localChain.then(fn, fn);
  localChain = run.catch(() => {});
  return run;
}

// --- lecture / écriture ---
async function readAll() {
  if (useKv) {
    const list = await kv.get(REG_KEY);
    return Array.isArray(list) ? list : [];
  }
  return readFile();
}

async function writeAll(list) {
  if (useKv) {
    await kv.set(REG_KEY, list);
    return;
  }
  writeFile(list);
}

// --- verrou (sérialise les écritures) ---
async function withLock(fn) {
  if (!useKv) {
    return withLocalLock(fn);
  }
  let acquired = null;
  for (let i = 0; i < 60 && !acquired; i++) {
    // NX = ne pose la clé que si elle n'existe pas déjà ; EX 5 = expire après
    // 5s au cas où une fonction plante avant de relâcher le verrou.
    acquired = await kv.set(LOCK_KEY, String(Date.now()), { nx: true, ex: 5 });
    if (!acquired) await sleep(120);
  }
  if (!acquired) {
    const err = new Error('Le service est très sollicité, réessayez dans un instant.');
    err.code = 'LOCK_TIMEOUT';
    throw err;
  }
  try {
    return await fn();
  } finally {
    await kv.del(LOCK_KEY);
  }
}

module.exports = { readAll, writeAll, withLock, useKv };

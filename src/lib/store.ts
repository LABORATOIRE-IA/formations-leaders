import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { BlobError, del, get, list, put } from "@vercel/blob";
import { SLOTS } from "./slots";

/** Nombre de places par créneau (défaut : 20). */
export const SLOT_CAPACITY = Number(process.env.SLOT_CAPACITY ?? 20);

/**
 * Stockage sans base de données.
 *
 * Chaque inscrit occupe une « place » = un petit fichier JSON
 * `seats/<créneau>/NNN.json`. Un fichier ne peut être créé que s'il n'existe
 * pas déjà (écriture atomique côté stockage) : deux personnes ne peuvent donc
 * jamais prendre la même place et on ne dépasse jamais SLOT_CAPACITY par
 * créneau, même avec des centaines d'inscriptions simultanées.
 * Un fichier `emails/<hash>.json` limite chaque personne à une seule inscription.
 *
 * En production : Vercel Blob (privé). En local sans token : dossier `.data/`.
 */

type Backend = {
  putIfAbsent(key: string, body: string): Promise<boolean>;
  remove(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
  read(key: string): Promise<string | null>;
};

const useBlob = !!process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL === "1";

const blobBackend: Backend = {
  async putIfAbsent(key, body) {
    try {
      await put(key, body, {
        access: "private",
        allowOverwrite: false,
        addRandomSuffix: false,
        contentType: "application/json",
      });
      return true;
    } catch (e) {
      if (e instanceof BlobError && /already exists/i.test(e.message)) return false;
      throw e;
    }
  },
  async remove(key) {
    await del(key);
  },
  async keys(prefix) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ prefix, cursor, limit: 1000 });
      out.push(...res.blobs.map((b) => b.pathname));
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
    return out;
  },
  async read(key) {
    const res = await get(key, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    return await new Response(res.stream).text();
  },
};

const DATA_DIR = path.join(process.cwd(), ".data");

const fileBackend: Backend = {
  async putIfAbsent(key, body) {
    const file = path.join(DATA_DIR, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    try {
      await fs.writeFile(file, body, { flag: "wx" }); // échoue si le fichier existe
      return true;
    } catch (e: any) {
      if (e?.code === "EEXIST") return false;
      throw e;
    }
  },
  async remove(key) {
    await fs.rm(path.join(DATA_DIR, key), { force: true });
  },
  async keys(prefix) {
    const out: string[] = [];
    async function walk(rel: string) {
      let entries;
      try {
        entries = await fs.readdir(path.join(DATA_DIR, rel), { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) await walk(r);
        else if (r.startsWith(prefix)) out.push(r);
      }
    }
    await walk("");
    return out;
  },
  async read(key) {
    try {
      return await fs.readFile(path.join(DATA_DIR, key), "utf8");
    } catch {
      return null;
    }
  },
};

const store: Backend = useBlob ? blobBackend : fileBackend;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const seatKey = (slot: string, n: number) => `seats/${slot}/${String(n).padStart(3, "0")}.json`;
const emailKey = (email: string) => `emails/${sha(email.toLowerCase())}.json`;
const parseSeatKey = (key: string) => {
  const m = key.match(/^seats\/([^/]+)\/(\d+)\.json$/);
  return m ? { slot: m[1], seat: Number(m[2]) } : null;
};
const validSlot = (slot: string) => SLOTS.some((s) => s.id === slot);

type SeatFile = {
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  note: string | null;
  created_at: string;
  token_hash: string;
};

export type Registration = {
  slot: string;
  seat: number;
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  note: string | null;
  created_at: string;
};

async function readSeat(slot: string, seat: number): Promise<SeatFile | null> {
  const raw = await store.read(seatKey(slot, seat));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SeatFile;
  } catch {
    return null;
  }
}

function tokenOk(seat: SeatFile, token: string): boolean {
  const a = Buffer.from(seat.token_hash);
  const b = Buffer.from(sha(token));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Nombre d'inscrits par créneau. */
export async function slotCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const s of SLOTS) counts[s.id] = 0;
  for (const k of await store.keys("seats/")) {
    const p = parseSeatKey(k);
    if (p && p.slot in counts) counts[p.slot]++;
  }
  return counts;
}

/** Liste complète (admin), sans les jetons secrets. */
export async function listRegistrations(): Promise<Registration[]> {
  const keys = await store.keys("seats/");
  const items = await Promise.all(
    keys.map(async (k) => {
      const p = parseSeatKey(k);
      if (!p) return null;
      const s = await readSeat(p.slot, p.seat);
      if (!s) return null;
      const { token_hash, ...rest } = s;
      return { slot: p.slot, seat: p.seat, ...rest } as Registration;
    })
  );
  return items
    .filter((x): x is Registration => !!x)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export type NewRegistration = {
  slot: string;
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  note?: string;
};

export type RegisterResult =
  | { ok: true; slot: string; seat: number; token: string }
  | { ok: false; reason: "full" | "duplicate" | "invalid_slot" };

export async function register(data: NewRegistration): Promise<RegisterResult> {
  if (!validSlot(data.slot)) return { ok: false, reason: "invalid_slot" };
  const email = data.email.toLowerCase();

  // 1. Réserver l'e-mail : une seule inscription par personne
  const claimed = await store.putIfAbsent(emailKey(email), JSON.stringify({ at: new Date().toISOString() }));
  if (!claimed) return { ok: false, reason: "duplicate" };

  try {
    // 2. Prendre la première place libre du créneau
    const token = randomBytes(24).toString("hex");
    const body = JSON.stringify({
      first_name: data.firstName,
      last_name: data.lastName,
      email,
      company: data.company || null,
      note: data.note || null,
      created_at: new Date().toISOString(),
      token_hash: sha(token),
    } satisfies SeatFile);
    for (let n = 1; n <= SLOT_CAPACITY; n++) {
      if (await store.putIfAbsent(seatKey(data.slot, n), body)) {
        return { ok: true, slot: data.slot, seat: n, token };
      }
    }
    // 3. Créneau complet : on libère l'e-mail
    await store.remove(emailKey(email));
    return { ok: false, reason: "full" };
  } catch (e) {
    await store.remove(emailKey(email)).catch(() => {});
    throw e;
  }
}

/** Vérifie qu'une inscription existe toujours et appartient bien au porteur du jeton. */
export async function verifyMine(slot: string, seat: number, token: string): Promise<boolean> {
  if (!validSlot(slot) || !Number.isInteger(seat) || !token) return false;
  const s = await readSeat(slot, seat);
  return !!s && tokenOk(s, token);
}

/** Annulation par l'inscrit lui-même. */
export async function cancel(slot: string, seat: number, token: string): Promise<boolean> {
  if (!validSlot(slot) || !Number.isInteger(seat) || !token) return false;
  const s = await readSeat(slot, seat);
  if (!s || !tokenOk(s, token)) return false;
  await store.remove(seatKey(slot, seat));
  await store.remove(emailKey(s.email));
  return true;
}

/** Suppression par l'administrateur. */
export async function adminRemove(slot: string, seat: number): Promise<boolean> {
  if (!validSlot(slot) || !Number.isInteger(seat)) return false;
  const s = await readSeat(slot, seat);
  if (!s) return false;
  await store.remove(seatKey(slot, seat));
  await store.remove(emailKey(s.email));
  return true;
}

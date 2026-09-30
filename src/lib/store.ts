import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { BlobError, del, get, list, put } from "@vercel/blob";

export const MAX_REGISTRATIONS = Number(process.env.MAX_REGISTRATIONS ?? 20);

/**
 * Stockage sans base de données.
 *
 * Chaque inscrit occupe une « place » = un petit fichier JSON `slots/NN.json`.
 * Un fichier ne peut être créé que s'il n'existe pas déjà (écriture atomique
 * côté stockage) : deux personnes ne peuvent donc jamais prendre la même place
 * et on ne peut jamais dépasser MAX_REGISTRATIONS, même avec des centaines
 * d'inscriptions simultanées. Un second fichier `emails/<hash>.json` empêche
 * les doublons d'e-mail.
 *
 * En production : Vercel Blob (privé). En local sans token : dossier `.data/`.
 */

type Backend = {
  /** Crée le fichier seulement s'il n'existe pas. Retourne false s'il existe déjà. */
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
    // prefix = "slots/" → dossier "slots"
    const folder = prefix.endsWith("/") ? prefix.slice(0, -1) : path.posix.dirname(prefix);
    try {
      const names = await fs.readdir(path.join(DATA_DIR, folder));
      return names.map((n) => `${folder}/${n}`).filter((k) => k.startsWith(prefix));
    } catch {
      return [];
    }
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

const slotKey = (n: number) => `slots/${String(n).padStart(3, "0")}.json`;
const emailKey = (email: string) => `emails/${createHash("sha256").update(email.toLowerCase()).digest("hex")}.json`;
const slotNumber = (key: string) => Number(key.match(/slots\/(\d+)\.json$/)?.[1] ?? NaN);

export type Registration = {
  id: number; // numéro de place
  first_name: string;
  last_name: string;
  email: string;
  company: string | null;
  note: string | null;
  created_at: string;
};

export async function countRegistrations(): Promise<number> {
  return (await store.keys("slots/")).length;
}

export async function listRegistrations(): Promise<Registration[]> {
  const keys = await store.keys("slots/");
  const items = await Promise.all(
    keys.map(async (k) => {
      const raw = await store.read(k);
      if (!raw) return null;
      try {
        return { ...JSON.parse(raw), id: slotNumber(k) } as Registration;
      } catch {
        return null;
      }
    })
  );
  return items
    .filter((x): x is Registration => !!x)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
}

export async function deleteRegistration(id: number): Promise<boolean> {
  const key = slotKey(id);
  const raw = await store.read(key);
  if (!raw) return false;
  let email: string | undefined;
  try {
    email = JSON.parse(raw).email;
  } catch {}
  await store.remove(key);
  if (email) await store.remove(emailKey(email));
  return true;
}

export type NewRegistration = {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  note?: string;
};

export type RegisterResult =
  | { ok: true; id: number; remaining: number }
  | { ok: false; reason: "full" | "duplicate" };

export async function register(data: NewRegistration): Promise<RegisterResult> {
  const email = data.email.toLowerCase();

  // 1. Réserver l'e-mail (anti-doublon)
  const emailClaimed = await store.putIfAbsent(emailKey(email), JSON.stringify({ at: new Date().toISOString() }));
  if (!emailClaimed) return { ok: false, reason: "duplicate" };

  try {
    // 2. Prendre la première place libre
    const body = JSON.stringify({
      first_name: data.firstName,
      last_name: data.lastName,
      email,
      company: data.company || null,
      note: data.note || null,
      created_at: new Date().toISOString(),
    });
    for (let n = 1; n <= MAX_REGISTRATIONS; n++) {
      if (await store.putIfAbsent(slotKey(n), body)) {
        const count = await countRegistrations();
        return { ok: true, id: n, remaining: Math.max(0, MAX_REGISTRATIONS - count) };
      }
    }
    // 3. Aucune place : on libère l'e-mail
    await store.remove(emailKey(email));
    return { ok: false, reason: "full" };
  } catch (e) {
    await store.remove(emailKey(email)).catch(() => {});
    throw e;
  }
}

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const COOKIE = "admin_session";

function token(): string {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) throw new Error("ADMIN_PASSWORD manquant");
  return createHmac("sha256", pwd).update("vibecode-admin-v1").digest("hex");
}

export function passwordMatches(input: string): boolean {
  const pwd = process.env.ADMIN_PASSWORD;
  if (!pwd) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pwd);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionValue(): string {
  return token();
}

export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD) return false;
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return false;
  const a = Buffer.from(c);
  const b = Buffer.from(token());
  return a.length === b.length && timingSafeEqual(a, b);
}

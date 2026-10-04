import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";

const COOKIE = "zeta_session";
const SESSION_DAYS = 30;

export type SessionUser = { id: number; email: string; name: string | null };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Solo en Server Actions / Route Handlers (son los únicos que pueden escribir cookies).
export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const sql = await db();
  await sql`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const sql = await db();
    await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  }
  store.delete(COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const sql = await db();
  const [user] = await sql<SessionUser[]>`
    SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
  return user ?? null;
}

// Para páginas y acciones privadas: si no hay sesión, manda a /entrar.
export async function requireUser(next = "/mi-zeta"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return user;
}

// Panel admin: solo los correos listados en ZETA_ADMIN_EMAILS (separados por coma).
export function isAdminEmail(email: string): boolean {
  const list = (process.env.ZETA_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

export async function requireAdmin(next = "/admin"): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!isAdminEmail(user.email)) redirect("/");
  return user;
}

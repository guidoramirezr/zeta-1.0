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
  db()
    .prepare(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`)
    .run(hashToken(token), userId);
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
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  store.delete(COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const user = db()
    .prepare(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > datetime('now')`,
    )
    .get(hashToken(token)) as SessionUser | undefined;
  return user ?? null;
}

// Para páginas y acciones privadas: si no hay sesión, manda a /entrar.
export async function requireUser(next = "/mi-zeta"): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(next)}`);
  return user;
}

import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db/client";

// Login sin contraseña: correo + código de 6 dígitos (válido 10 minutos,
// máximo 5 intentos, máximo 5 códigos por correo cada 15 minutos).

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;

export class AuthError extends Error {}

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
    throw new AuthError("Escribe un correo válido.");
  }
  return email;
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

// Modo local: el código se muestra en pantalla porque aún no hay servicio de
// correo. NUNCA se activa en producción.
export function isLocalCodeMode() {
  return process.env.NODE_ENV !== "production";
}

export function requestLoginCode(rawEmail: string): { email: string; localCode: string | null } {
  const email = normalizeEmail(rawEmail);
  const conn = db();
  const { recent } = conn
    .prepare("SELECT COUNT(*) AS recent FROM login_codes WHERE email = ? AND created_at > datetime('now', '-15 minutes')")
    .get(email) as { recent: number };
  if (recent >= MAX_CODES_PER_WINDOW) {
    throw new AuthError("Pediste demasiados códigos. Espera unos minutos e intenta de nuevo.");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  conn
    .prepare(
      `INSERT INTO login_codes (email, code_hash, expires_at)
       VALUES (?, ?, datetime('now', '+${CODE_TTL_MIN} minutes'))`,
    )
    .run(email, hashCode(email, code));

  if (isLocalCodeMode()) return { email, localCode: code };
  // TODO(correo): conectar un servicio de envío (ej. Resend) antes de publicar.
  throw new AuthError("El envío de códigos por correo todavía no está configurado.");
}

// Devuelve el id del usuario (lo crea si es su primera vez).
export function verifyLoginCode(rawEmail: string, rawCode: string, name?: string): number {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  const conn = db();
  const row = conn
    .prepare(
      `SELECT id, code_hash AS codeHash, attempts FROM login_codes
        WHERE email = ? AND used_at IS NULL AND expires_at > datetime('now')
        ORDER BY id DESC LIMIT 1`,
    )
    .get(email) as { id: number; codeHash: string; attempts: number } | undefined;

  if (!row || row.attempts >= MAX_ATTEMPTS) {
    throw new AuthError("El código venció o ya no es válido. Pide uno nuevo.");
  }
  const ok =
    code.length === 6 &&
    timingSafeEqual(Buffer.from(hashCode(email, code), "hex"), Buffer.from(row.codeHash, "hex"));
  if (!ok) {
    conn.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    throw new AuthError("Código incorrecto.");
  }
  conn.prepare("UPDATE login_codes SET used_at = datetime('now') WHERE id = ?").run(row.id);

  conn.prepare("INSERT INTO users (email, name) VALUES (?, ?) ON CONFLICT(email) DO NOTHING").run(
    email,
    name?.trim() || null,
  );
  const user = conn.prepare("SELECT id, name FROM users WHERE email = ?").get(email) as { id: number; name: string | null };
  if (!user.name && name?.trim()) conn.prepare("UPDATE users SET name = ? WHERE id = ?").run(name.trim(), user.id);
  return user.id;
}

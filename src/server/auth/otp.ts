import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db, transaction } from "@/server/db/client";

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

// Modo local: el código se muestra en pantalla porque no hay servicio de
// correo en tu computadora. NUNCA se activa en producción.
export function isLocalCodeMode() {
  return process.env.NODE_ENV !== "production";
}

export async function requestLoginCode(rawEmail: string): Promise<{ email: string; localCode: string | null }> {
  const email = normalizeEmail(rawEmail);
  const sql = await db();
  const [{ recent }] = await sql<{ recent: number }[]>`
    SELECT COUNT(*)::int AS recent FROM login_codes
     WHERE email = ${email} AND created_at > now() - interval '15 minutes'`;
  if (recent >= MAX_CODES_PER_WINDOW) {
    throw new AuthError("Pediste demasiados códigos. Espera unos minutos e intenta de nuevo.");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await sql`
    INSERT INTO login_codes (email, code_hash, expires_at)
    VALUES (${email}, ${hashCode(email, code)}, now() + make_interval(mins => ${CODE_TTL_MIN}))`;

  if (isLocalCodeMode()) return { email, localCode: code };
  await sendCodeByEmail(email, code);
  return { email, localCode: null };
}

// Envío por correo con Resend (resend.com). Requiere RESEND_API_KEY y,
// para enviar a cualquier correo, un dominio verificado en ZETA_EMAIL_FROM.
async function sendCodeByEmail(email: string, code: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new AuthError("El envío de códigos por correo todavía no está configurado.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ZETA_EMAIL_FROM || "Zeta <onboarding@resend.dev>",
      to: [email],
      subject: `Tu código de Zeta: ${code}`,
      text: `Tu código para entrar a Zeta es ${code}.\n\nVence en ${CODE_TTL_MIN} minutos. Si no lo pediste, ignora este correo.`,
    }),
  });
  if (!res.ok) {
    console.error("[auth] no se pudo enviar el correo:", res.status);
    throw new AuthError("No pudimos enviarte el código. Intenta de nuevo en unos minutos.");
  }
}

// Devuelve el id del usuario (lo crea si es su primera vez).
export async function verifyLoginCode(rawEmail: string, rawCode: string, name?: string): Promise<number> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  const sql = await db();
  const [row] = await sql<{ id: number; codeHash: string; attempts: number }[]>`
    SELECT id, code_hash AS "codeHash", attempts FROM login_codes
     WHERE email = ${email} AND used_at IS NULL AND expires_at > now()
     ORDER BY id DESC LIMIT 1`;

  if (!row || row.attempts >= MAX_ATTEMPTS) {
    throw new AuthError("El código venció o ya no es válido. Pide uno nuevo.");
  }
  const ok =
    code.length === 6 &&
    timingSafeEqual(Buffer.from(hashCode(email, code), "hex"), Buffer.from(row.codeHash, "hex"));
  if (!ok) {
    await sql`UPDATE login_codes SET attempts = attempts + 1 WHERE id = ${row.id}`;
    throw new AuthError("Código incorrecto.");
  }

  const cleanName = name?.trim() || null;
  return transaction(async (tx) => {
    await tx`UPDATE login_codes SET used_at = now() WHERE id = ${row.id}`;
    await tx`INSERT INTO users (email, name) VALUES (${email}, ${cleanName}) ON CONFLICT ((lower(email))) DO NOTHING`;
    const [user] = await tx<{ id: number; name: string | null }[]>`SELECT id, name FROM users WHERE lower(email) = ${email}`;
    if (!user.name && cleanName) await tx`UPDATE users SET name = ${cleanName} WHERE id = ${user.id}`;
    return user.id;
  });
}

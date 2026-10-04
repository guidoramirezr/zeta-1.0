import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db/client";

// Límites diarios de consultas con IA (Claude). Solo cuentan las respuestas
// que redacta Claude; catálogo, tarjetas y cotizador no tienen límite.
// Los números se cambian en .env.local sin tocar código.

export type Tier = "invitado" | "gratis" | "pro";

export const TIER_LABELS: Record<Tier, string> = { invitado: "Sin sesión", gratis: "Gratis", pro: "Pro" };

function envInt(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

export function dailyLimit(tier: Tier): number {
  if (tier === "pro") return envInt("ZETA_LIMIT_PRO", 200);
  if (tier === "gratis") return envInt("ZETA_LIMIT_FREE", 20);
  return envInt("ZETA_LIMIT_ANON", 5);
}

// Día actual en Ecuador (UTC-5, sin horario de verano): el contador se reinicia a medianoche local.
export function todayKey(now = new Date()): string {
  return new Date(now.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

// Plan efectivo de un usuario: "pro" solo si no venció.
export function userTier(userId: number | null): Tier {
  if (userId == null) return "invitado";
  const u = db().prepare("SELECT plan, plan_until AS planUntil FROM users WHERE id = ?").get(userId) as
    | { plan: string; planUntil: string | null }
    | undefined;
  if (u?.plan === "pro" && (!u.planUntil || u.planUntil >= todayKey())) return "pro";
  return "gratis";
}

export type Who = { userId: number | null; anonId: string | null; ip: string | null };

// Invitados: se cuentan por cookie Y por IP (borrar la cookie no reinicia el límite).
function subjects(who: Who): string[] {
  if (who.userId != null) return [`u:${who.userId}`];
  const list: string[] = [];
  if (who.anonId) list.push(`a:${who.anonId}`);
  if (who.ip) list.push(`ip:${createHash("sha256").update(`zeta:${who.ip}`).digest("hex").slice(0, 32)}`);
  return list.length ? list : ["a:desconocido"];
}

export type UsageStatus = { tier: Tier; limit: number; used: number; remaining: number };

export function usageStatus(who: Who, day = todayKey()): UsageStatus {
  const tier = userTier(who.userId);
  const limit = dailyLimit(tier);
  const stmt = db().prepare("SELECT count FROM ai_usage WHERE subject = ? AND day = ?");
  const used = Math.max(0, ...subjects(who).map((s) => (stmt.get(s, day) as { count: number } | undefined)?.count ?? 0));
  return { tier, limit, used, remaining: Math.max(0, limit - used) };
}

export function recordUse(who: Who, day = todayKey()) {
  const stmt = db().prepare(
    `INSERT INTO ai_usage (subject, day, count) VALUES (?, ?, 1)
     ON CONFLICT(subject, day) DO UPDATE SET count = count + 1`,
  );
  for (const s of subjects(who)) stmt.run(s, day);
}

// ---------- administración de planes (panel admin) ----------

export function setUserPlan(userId: number, plan: "gratis" | "pro", until: string | null) {
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error("Fecha no válida");
  db().prepare("UPDATE users SET plan = ?, plan_until = ? WHERE id = ?").run(plan, plan === "pro" ? until : null, userId);
}

export function listUsersWithUsage(day = todayKey()) {
  return db()
    .prepare(
      `SELECT u.id, u.email, u.name, u.plan, u.plan_until AS planUntil, u.created_at AS createdAt,
              COALESCE(a.count, 0) AS usedToday
         FROM users u LEFT JOIN ai_usage a ON a.subject = 'u:' || u.id AND a.day = ?
        ORDER BY u.created_at DESC`,
    )
    .all(day) as {
    id: number; email: string; name: string | null; plan: string; planUntil: string | null; createdAt: string; usedToday: number;
  }[];
}

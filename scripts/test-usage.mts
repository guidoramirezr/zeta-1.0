// Prueba de límites diarios de IA con datos FICTICIOS en base temporal.
// Uso: npm run test:usage
import { rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const tmp = path.join(os.tmpdir(), `zeta-u-${process.pid}.db`);
Object.assign(process.env, { ZETA_DB_PATH: tmp, ZETA_LIMIT_ANON: "2", ZETA_LIMIT_FREE: "3", ZETA_LIMIT_PRO: "5" });
const otp = await import("../src/server/auth/otp");
const L = await import("../src/server/usage/limits");
const ok = (m: string) => console.log("  ✓", m);

try {
  const day = "2026-10-03";
  // Invitado
  const anon = { userId: null, anonId: "11111111-1111-1111-1111-111111111111", ip: "10.0.0.1" };
  assert.equal(L.usageStatus(anon, day).remaining, 2);
  L.recordUse(anon, day); L.recordUse(anon, day);
  assert.equal(L.usageStatus(anon, day).remaining, 0);
  ok("sin sesión: 2 consultas y se agota");
  const sinCookie = { ...anon, anonId: "22222222-2222-2222-2222-222222222222" };
  assert.equal(L.usageStatus(sinCookie, day).remaining, 0);
  ok("borrar la cookie no reinicia el límite (misma IP)");
  const otraRed = { userId: null, anonId: "33333333-3333-3333-3333-333333333333", ip: "10.0.0.2" };
  assert.equal(L.usageStatus(otraRed, day).remaining, 2);
  ok("otra persona (otra IP) tiene su propio límite");
  assert.equal(L.usageStatus(anon, "2026-10-04").remaining, 2);
  ok("al día siguiente se renueva");

  // Con sesión
  const id = otp.verifyLoginCode("carlos@taller.test", otp.requestLoginCode("carlos@taller.test").localCode!);
  const user = { userId: id, anonId: null, ip: "10.0.0.1" };
  assert.equal(L.usageStatus(user, day).tier, "gratis");
  assert.equal(L.usageStatus(user, day).remaining, 3);
  ok("con sesión: plan gratis con 3 (no hereda lo gastado como invitado en esa IP)");
  for (let i = 0; i < 3; i++) L.recordUse(user, day);
  assert.equal(L.usageStatus(user, day).remaining, 0);

  // Pro
  L.setUserPlan(id, "pro", "2026-11-03");
  const s = L.usageStatus(user, day);
  assert.equal(s.tier, "pro");
  assert.equal(s.remaining, 2); // 5 - 3 ya usadas hoy
  ok("al activar Pro sube a 5 (le quedan 2 hoy)");
  L.setUserPlan(id, "pro", "2026-01-01");
  assert.equal(L.userTier(id), "gratis");
  ok("Pro vencido vuelve a gratis");
  L.setUserPlan(id, "pro", null);
  assert.equal(L.userTier(id), "pro");
  ok("Pro sin fecha de vencimiento");

  assert.equal(L.todayKey(new Date("2026-10-04T03:00:00Z")), "2026-10-03");
  assert.equal(L.todayKey(new Date("2026-10-04T05:30:00Z")), "2026-10-04");
  ok("el día cambia a medianoche de Ecuador (05:00 UTC)");
  console.log("\nTodo OK");
} finally {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) rmSync(f, { force: true });
}

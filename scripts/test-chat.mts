// Prueba del chat (sin IA) con productos FICTICIOS en un esquema temporal de Supabase.
// Uso: npm run test:chat
import { setupTestDatabase } from "./test-db.mjs";

const cleanup = await setupTestDatabase();
try {
  const { db } = await import("../src/server/db/client");
  const { buildSearchText } = await import("../src/server/catalog/normalize");
  const { respond } = await import("../src/server/chat/respond");

  const sql = await db();
  const [{ id: companyId }] = await sql<{ id: number }[]>`INSERT INTO companies (name) VALUES ('Demo') RETURNING id`;
  const fake: [string, string, string, number | null][] = [
    ["F1", "SENSOR CIGUENAL CHEVROLET AVEO 1.6", "SENSOR CIGUENAL", 20],
    ["F2", "SENSOR TPS CHEVROLET AVEO 1.5", "SENSOR TPS", 25],
    ["F3", "SENSOR TPS KIA RIO 1.5", "SENSOR TPS", null],
    ["F4", "BOMBA COMBUSTIBLE KIA RIO 1.4 06-11", "BOMBA COMBUSTIBLE", 60],
    ["F5", "SENSOR OXIGENO CHEVROLET AVEO FAMILY", "SENSOR OXIGENO", 40],
    ["SA123", "PASTILLAS DE FRENOS DEL. HYUNDAI ACCENT", "PASTILLAS DE FRENOS", 30],
    ["F7", "ARTICULACION DIRECCION CHEVROLET AVEO", "ARTICULACION DIRECCION", 7],
  ];
  await sql`INSERT INTO products ${sql(
    fake.map(([code, desc, cat, price]) => ({
      company_id: companyId, internal_code: code, description: desc, category: cat, cost: 1, price,
      search_text: buildSearchText({ description: desc, internalCode: code, category: cat }),
    })),
  )}`;

  const questions = [
    "¿Tienes repuestos para Aveo?",
    "¿Qué tienes para Chevrolet?",
    "Muéstrame repuestos para Kia Rio.",
    "¿Tienes sensor TPS para Aveo?",
    "¿Tienes sensor CKP para Aveo?",
    "Necesito el sensor de aceleración del Aveo",
    "¿Cuánto cuesta el sensor de oxígeno del Aveo?",
    "Busco una bomba de gasolina para Kia Rio.",
    "¿Qué producto es el código SA123?",
    "Busca SA123",
    "Busca ZZ999",
    "Necesito algo para solucionar una falla de aceleración en un Aveo.",
    "¿Qué significa el código P0171?",
    "¿Tienes amortiguadores para Corolla?",
    "hola",
  ];
  let ctx = undefined;
  for (const q of questions) {
    const { reply, context } = await respond(q, ctx);
    ctx = context;
    console.log(`\n> ${q}\n  ${reply.text.replace(/\n+/g, " ")}`);
    for (const p of reply.products ?? []) console.log(`   [${p.code}] ${p.description} — ${p.price ?? "por confirmar"}`);
    if (reply.actions) console.log("   botones:", reply.actions.map((a) => a.label).join(" | "));
    if ((reply.products ?? []).some((p) => "cost" in p)) throw new Error("¡El costo se filtró al chat!");
  }
} finally {
  await cleanup();
}

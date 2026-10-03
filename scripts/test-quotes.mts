// Prueba del Cotizador conversacional con datos FICTICIOS en base temporal.
// Uso: npm run test:quotes
import { rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const tmp = path.join(os.tmpdir(), `zeta-q-${process.pid}.db`);
process.env.ZETA_DB_PATH = tmp;
const { db } = await import("../src/server/db/client");
const { buildSearchText } = await import("../src/server/catalog/normalize");
const otp = await import("../src/server/auth/otp");
const { respond } = await import("../src/server/chat/respond");
const q = await import("../src/server/quotes/repository");
const { quoteTotals, whatsappText, whatsappLink } = await import("../src/core/quotes/types");

const ok = (m: string) => console.log("  ✓", m);
const login = (email: string) => {
  const id = otp.verifyLoginCode(email, otp.requestLoginCode(email).localCode!, "Carlos");
  return { id, email, name: "Carlos" };
};
type Ctx = Parameters<typeof respond>[1];
function chat(user: ReturnType<typeof login> | null, lines: string[], ctx?: Ctx) {
  let r!: ReturnType<typeof respond>;
  for (const line of lines) {
    r = respond(line, ctx, user);
    ctx = r.context;
    console.log(`    > ${line}\n      ${r.reply.text.replace(/\n+/g, " ")}${r.reply.actions ? `  [${r.reply.actions.map((a) => a.label).join(" | ")}]` : ""}`);
  }
  return r;
}

try {
  const conn = db();
  conn.prepare("INSERT INTO companies (name) VALUES ('Demo')").run();
  const desc = "KIT EMBRAGUE CHEVROLET AVEO 1.6";
  conn.prepare(`INSERT INTO products (company_id, internal_code, description, part_brand, category, cost, price, search_text)
                VALUES (1, 'DEMO-KE1', ?, 'DemoBrand', 'KIT EMBRAGUE', 50, 85, ?)`).run(desc, buildSearchText({ description: desc, internalCode: "DEMO-KE1", partBrand: "DemoBrand", category: "KIT EMBRAGUE" }));

  // Sin sesión → pide iniciar sesión
  const anon = respond("Aveo 2010, cambio de kit de embrague.", undefined, null);
  assert.equal(anon.reply.link?.href, "/entrar?next=/");
  ok("sin sesión: Zeta pide iniciar sesión (el chat sigue público)");

  const carlos = login("carlos@taller.test");
  console.log("\n  Conversación del ejemplo:");
  const r = chat(carlos, [
    "Aveo 2010, cambio de kit de embrague.",
    "Sí, agregar mano de obra",
    "60",
    "Ver opciones del catálogo",
    "Usar producto #1",
    "Cliente nuevo",
    "Juan Pérez 0991234567",
  ]);
  const draft = r.reply.quote!;
  assert.ok(draft, "debe mostrar la tarjeta");
  assert.equal(r.context.quote, null);
  assert.deepEqual(draft.items.map((i) => [i.kind, i.unitPrice]), [["repuesto", 85], ["mano_obra", 60]]);
  assert.equal(quoteTotals(draft).total, 145);
  assert.equal(draft.vehicle?.year, 2010);
  ok("cotización armada: kit $85 (catálogo) + mano de obra $60 = $145");

  const saved = q.saveQuote(carlos.id, draft);
  assert.equal(saved.number, 1);
  assert.ok(saved.clientId && saved.vehicleId, "crea cliente y vehículo nuevos");
  const back = q.getQuoteDraft(carlos.id, saved.quoteId)!;
  assert.equal(back.clientName, "Juan Pérez");
  assert.equal(quoteTotals(back).total, 145);
  ok("guardada como #1, con cliente Juan Pérez y su Aveo 2010 creados en Mi Zeta");

  const text = whatsappText(back, "Taller Demo");
  assert.match(text, /Hola Juan 👋/);
  assert.match(text, /Chevrolet Aveo 2010/);
  assert.match(text, /Total: \$145\.00/);
  assert.match(whatsappLink(back.clientPhone, text), /^https:\/\/wa\.me\/593991234567\?text=/);
  ok("mensaje de WhatsApp y enlace con 593…");

  // Segunda vez: sugiere el precio habitual y ofrece el vehículo ya registrado
  console.log("\n  Segunda cotización (precio habitual):");
  const r2 = chat(carlos, ["Aveo 2010, cambio de kit de embrague"]);
  assert.match(r2.reply.text, /precio habitual.*\$60\.00/);
  const r3 = chat(carlos, ["Sí", "Pondré el precio a mano"], r2.context);
  assert.ok(r3.reply.actions?.some((a) => a.prompt === `Usar vehículo #${saved.vehicleId}`));
  ok("sugiere $60 habitual y ofrece el Aveo de Juan ya registrado (sin duplicar)");
  const r4 = chat(carlos, [`Usar vehículo #${saved.vehicleId}`], r3.context);
  assert.equal(r4.reply.quote?.clientId, saved.clientId);
  assert.equal(q.saveQuote(carlos.id, r4.reply.quote!).number, 2);
  assert.equal((conn.prepare("SELECT COUNT(*) n FROM clients").get() as { n: number }).n, 1);
  ok("cotización #2 reutiliza cliente y vehículo existentes");

  // Plantilla
  q.saveTemplate(carlos.id, "Mantenimiento 10.000 km", [
    { key: "a", kind: "repuesto", description: "Aceite 10W30", quantity: 4, unitPrice: 8 },
    { key: "b", kind: "repuesto", description: "Filtro de aceite", quantity: 1, unitPrice: null },
    { key: "c", kind: "mano_obra", description: "Mano de obra – mantenimiento", quantity: 1, unitPrice: 15 },
  ]);
  console.log("\n  Plantilla:");
  const r5 = chat(carlos, ["Hazme el mantenimiento de 10 mil para este carro"], { vehicle: { brand: "Chevrolet", model: "Aveo" } });
  assert.match(r5.reply.text, /plantilla “Mantenimiento 10\.000 km”/);
  const r6 = chat(carlos, [`Usar vehículo #${saved.vehicleId}`], r5.context);
  assert.equal(r6.reply.quote?.items.length, 3);
  assert.equal(quoteTotals(r6.reply.quote!).total, 47);
  ok("“mantenimiento de 10 mil” usa la plantilla (4×$8 + $15 = $47, filtro pendiente)");

  // Catálogo vacío para el repuesto → no inventa
  console.log("\n  Repuesto sin catálogo:");
  const r7 = chat(carlos, ["Kia Rio 2018, cambio de pastillas de freno", "No"]);
  assert.match(r7.reply.text, /no voy a inventar un precio/);
  ok("si el repuesto no está en el catálogo, no inventa precio");

  // "Mano de obra" a secas: se guarda la cotización, pero no se aprende como precio
  const plain = q.saveQuote(carlos.id, { ...draft, items: [{ key: "x", kind: "mano_obra", description: "Mano de obra", quantity: 1, unitPrice: 30 }] });
  assert.ok(plain.number > 0);
  ok("“Mano de obra” sin nombre de trabajo se guarda sin romper nada");

  // Cancelar
  const r8 = chat(carlos, ["Cancelar cotización"], r2.context);
  assert.equal(r8.context.quote, null);
  ok("cancelar cotización");

  // Estados y privacidad
  q.setQuoteStatus(carlos.id, saved.quoteId, "aprobada");
  assert.equal(q.listQuotes(carlos.id).find((x) => x.id === saved.quoteId)?.status, "aprobada");
  const ana = login("ana@otro.test");
  assert.equal(q.getQuoteDraft(ana.id, saved.quoteId), null);
  assert.equal(q.listQuotes(ana.id).length, 0);
  assert.throws(() => q.setQuoteStatus(ana.id, saved.quoteId, "rechazada"), /no encontrada/);
  assert.throws(() => q.saveQuote(ana.id, { ...draft, quoteId: saved.quoteId }), /no encontrada/);
  assert.throws(() => q.saveQuote(ana.id, { ...draft, vehicleId: saved.vehicleId }), /no encontrado/);
  assert.equal(q.suggestLaborPrice(ana.id, "cambio de kit de embrague"), null);
  ok("privacidad: otra cuenta no ve ni modifica cotizaciones, precios ni vehículos ajenos");
  console.log("\nTodo OK");
} finally {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) rmSync(f, { force: true });
}

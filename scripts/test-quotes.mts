// Prueba del Cotizador conversacional con datos FICTICIOS en base temporal.
// Uso: npm run test:quotes
import assert from "node:assert/strict";
import { setupTestDatabase } from "./test-db.mjs";

const cleanup = await setupTestDatabase();
const { db } = await import("../src/server/db/client");
const { buildSearchText } = await import("../src/server/catalog/normalize");
const otp = await import("../src/server/auth/otp");
const { respond } = await import("../src/server/chat/respond");
const q = await import("../src/server/quotes/repository");
const { quoteTotals, whatsappText, whatsappLink } = await import("../src/core/quotes/types");

const ok = (m: string) => console.log("  ✓", m);
const login = async (email: string) => {
  const id = await otp.verifyLoginCode(email, (await otp.requestLoginCode(email)).localCode!, "Carlos");
  return { id, email, name: "Carlos" };
};
type Ctx = Parameters<typeof respond>[1];
async function chat(user: Awaited<ReturnType<typeof login>> | null, lines: string[], ctx?: Ctx) {
  let r!: Awaited<ReturnType<typeof respond>>;
  for (const line of lines) {
    r = await respond(line, ctx, user);
    ctx = r.context;
    console.log(`    > ${line}\n      ${r.reply.text.replace(/\n+/g, " ")}${r.reply.actions ? `  [${r.reply.actions.map((a) => a.label).join(" | ")}]` : ""}`);
  }
  return r;
}

try {
  const conn = await db();
  const [{ id: companyId }] = await conn<{ id: number }[]>`INSERT INTO companies (name) VALUES ('Demo') RETURNING id`;
  const desc = "KIT EMBRAGUE CHEVROLET AVEO 1.6";
  const [{ id: kitId }] = await conn<{ id: number }[]>`
    INSERT INTO products (company_id, internal_code, description, part_brand, category, cost, price, search_text)
    VALUES (${companyId}, 'DEMO-KE1', ${desc}, 'DemoBrand', 'KIT EMBRAGUE', 50, 85,
            ${buildSearchText({ description: desc, internalCode: "DEMO-KE1", partBrand: "DemoBrand", category: "KIT EMBRAGUE" })})
    RETURNING id`;

  // Sin sesión → pide iniciar sesión
  const anon = await respond("Aveo 2010, cambio de kit de embrague.", undefined, null);
  assert.equal(anon.reply.link?.href, "/entrar?next=/");
  ok("sin sesión: Zeta pide iniciar sesión (el chat sigue público)");

  const carlos = await login("carlos@taller.test");
  console.log("\n  Conversación del ejemplo:");
  const r = await chat(carlos, [
    "Aveo 2010, cambio de kit de embrague.",
    "Sí, agregar mano de obra",
    "60",
    "Ver opciones del catálogo",
    `Usar producto #${kitId}`,
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

  const saved = await q.saveQuote(carlos.id, draft);
  assert.equal(saved.number, 1);
  assert.ok(saved.clientId && saved.vehicleId, "crea cliente y vehículo nuevos");
  const back = (await q.getQuoteDraft(carlos.id, saved.quoteId))!;
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
  const r2 = await chat(carlos, ["Aveo 2010, cambio de kit de embrague"]);
  assert.match(r2.reply.text, /precio habitual.*\$60\.00/);
  const r3 = await chat(carlos, ["Sí", "Pondré el precio a mano"], r2.context);
  assert.ok(r3.reply.actions?.some((a) => a.prompt === `Usar vehículo #${saved.vehicleId}`));
  ok("sugiere $60 habitual y ofrece el Aveo de Juan ya registrado (sin duplicar)");
  const r4 = await chat(carlos, [`Usar vehículo #${saved.vehicleId}`], r3.context);
  assert.equal(r4.reply.quote?.clientId, saved.clientId);
  assert.equal((await q.saveQuote(carlos.id, r4.reply.quote!)).number, 2);
  assert.equal((await conn<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM clients`)[0].n, 1);
  ok("cotización #2 reutiliza cliente y vehículo existentes");

  // Plantilla
  await q.saveTemplate(carlos.id, "Mantenimiento 10.000 km", [
    { key: "a", kind: "repuesto", description: "Aceite 10W30", quantity: 4, unitPrice: 8 },
    { key: "b", kind: "repuesto", description: "Filtro de aceite", quantity: 1, unitPrice: null },
    { key: "c", kind: "mano_obra", description: "Mano de obra – mantenimiento", quantity: 1, unitPrice: 15 },
  ]);
  console.log("\n  Plantilla:");
  const r5 = await chat(carlos, ["Hazme el mantenimiento de 10 mil para este carro"], { vehicle: { brand: "Chevrolet", model: "Aveo" } });
  assert.match(r5.reply.text, /plantilla “Mantenimiento 10\.000 km”/);
  const r6 = await chat(carlos, [`Usar vehículo #${saved.vehicleId}`], r5.context);
  assert.equal(r6.reply.quote?.items.length, 3);
  assert.equal(quoteTotals(r6.reply.quote!).total, 47);
  ok("“mantenimiento de 10 mil” usa la plantilla (4×$8 + $15 = $47, filtro pendiente)");

  // Catálogo vacío para el repuesto → no inventa
  console.log("\n  Repuesto sin catálogo:");
  const r7 = await chat(carlos, ["Kia Rio 2018, cambio de pastillas de freno", "No"]);
  assert.match(r7.reply.text, /no voy a inventar un precio/);
  ok("si el repuesto no está en el catálogo, no inventa precio");

  // "Mano de obra" a secas: se guarda la cotización, pero no se aprende como precio
  const plain = await q.saveQuote(carlos.id, { ...draft, items: [{ key: "x", kind: "mano_obra", description: "Mano de obra", quantity: 1, unitPrice: 30 }] });
  assert.ok(plain.number > 0);
  ok("“Mano de obra” sin nombre de trabajo se guarda sin romper nada");

  // Cancelar
  const r8 = await chat(carlos, ["Cancelar cotización"], r2.context);
  assert.equal(r8.context.quote, null);
  ok("cancelar cotización");

  // Estados y privacidad
  await q.setQuoteStatus(carlos.id, saved.quoteId, "aprobada");
  assert.equal((await q.listQuotes(carlos.id)).find((x) => x.id === saved.quoteId)?.status, "aprobada");
  const ana = await login("ana@otro.test");
  assert.equal(await q.getQuoteDraft(ana.id, saved.quoteId), null);
  assert.equal((await q.listQuotes(ana.id)).length, 0);
  await assert.rejects(async () => await q.setQuoteStatus(ana.id, saved.quoteId, "rechazada"), /no encontrada/);
  await assert.rejects(async () => await q.saveQuote(ana.id, { ...draft, quoteId: saved.quoteId }), /no encontrada/);
  await assert.rejects(async () => await q.saveQuote(ana.id, { ...draft, vehicleId: saved.vehicleId }), /no encontrado/);
  assert.equal(await q.suggestLaborPrice(ana.id, "cambio de kit de embrague"), null);
  ok("privacidad: otra cuenta no ve ni modifica cotizaciones, precios ni vehículos ajenos");
  console.log("\nTodo OK");
} finally {
  await cleanup();
}

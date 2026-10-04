import "server-only";
import {
  newItemKey,
  quoteTotals,
  round2,
  type QuoteDraft,
  type QuoteItem,
  type QuoteItemKind,
  type QuoteStatus,
} from "@/core/quotes/types";
import { normalizeText } from "@/server/catalog/normalize";
import { db, transaction, type Q } from "@/server/db/client";
import { WorkspaceError, createClient, getVehicle } from "@/server/workspace/repository";

// Cotizaciones PRIVADAS del taller (user_id). Reutiliza clientes y vehículos
// de Mi Zeta: nunca duplica datos que ya existen.

// ---------- claves de texto ("Mantenimiento 10.000 km" ≈ "mantenimiento de 10 mil") ----------

const KEY_STOPWORDS = new Set(
  "a al de del el la las los lo para por un una este esta ese esa carro auto vehiculo km hazme haz cotiza cotizame cotizacion presupuesto me mi su y con mano obra".split(" "),
);

export function jobKey(text: string): string {
  const prepared = text
    .replace(/(\d)[.,](\d{3})\b/g, "$1$2") //  10.000 → 10000
    .replace(/(\d+)\s*(mil|k)\b/gi, (_, n) => `${n}000`); // 10 mil / 10k → 10000
  return normalizeText(prepared)
    .split(" ")
    .filter((w) => w && !KEY_STOPWORDS.has(w))
    .join(" ");
}

function tokens(key: string) {
  return new Set(key.split(" ").filter(Boolean));
}

// ---------- taller ----------

export async function getWorkshopName(userId: number): Promise<string | null> {
  const sql = await db();
  const [r] = await sql<{ n: string | null }[]>`SELECT COALESCE(workshop_name, name) AS n FROM users WHERE id = ${userId}`;
  return r?.n ?? null;
}

export async function setWorkshopName(userId: number, name: string) {
  const sql = await db();
  await sql`UPDATE users SET workshop_name = ${name.trim() || null} WHERE id = ${userId}`;
}

// ---------- precios de mano de obra ----------

export type LaborPrice = { id: number; name: string; price: number };

export async function listLaborPrices(userId: number): Promise<LaborPrice[]> {
  const sql = await db();
  return [...(await sql<LaborPrice[]>`SELECT id, name, price FROM labor_prices WHERE user_id = ${userId} ORDER BY lower(name)`)];
}

export async function upsertLaborPrice(userId: number, name: string, price: number, q?: Q) {
  const clean = name.replace(/\s+/g, " ").trim();
  const key = jobKey(clean);
  if (!clean || !key) throw new WorkspaceError("Escribe el nombre del trabajo.");
  if (!Number.isFinite(price) || price < 0) throw new WorkspaceError("El precio no es válido.");
  const sql = q ?? (await db());
  await sql`
    INSERT INTO labor_prices (user_id, name, name_key, price) VALUES (${userId}, ${clean}, ${key}, ${round2(price)})
    ON CONFLICT (user_id, name_key) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, updated_at = now()`;
}

export async function deleteLaborPrice(userId: number, id: number) {
  const sql = await db();
  await sql`DELETE FROM labor_prices WHERE id = ${id} AND user_id = ${userId}`;
}

// Precio habitual para un trabajo: igual, o muy parecido (≥ 60% palabras en común).
export async function suggestLaborPrice(userId: number, jobTitle: string): Promise<LaborPrice | null> {
  const key = jobKey(jobTitle);
  if (!key) return null;
  const sql = await db();
  const all = await sql<(LaborPrice & { nameKey: string })[]>`
    SELECT id, name, name_key AS "nameKey", price FROM labor_prices WHERE user_id = ${userId}`;
  const exact = all.find((l) => l.nameKey === key);
  if (exact) return { id: exact.id, name: exact.name, price: exact.price };
  const want = tokens(key);
  let best: (typeof all)[number] | null = null;
  let bestScore = 0;
  for (const l of all) {
    const have = tokens(l.nameKey);
    const common = [...want].filter((t) => have.has(t)).length;
    const score = common / Math.max(want.size, have.size);
    if (score > bestScore) [best, bestScore] = [l, score];
  }
  return best && bestScore >= 0.6 ? { id: best.id, name: best.name, price: best.price } : null;
}

// ---------- plantillas ----------

export type QuoteTemplate = { id: number; name: string; items: QuoteItem[] };

type StoredItem = Pick<QuoteItem, "kind" | "description" | "quantity" | "unitPrice">;

export async function listTemplates(userId: number): Promise<QuoteTemplate[]> {
  const sql = await db();
  const rows = await sql<{ id: number; name: string; itemsJson: string }[]>`
    SELECT id, name, items_json AS "itemsJson" FROM quote_templates WHERE user_id = ${userId} ORDER BY lower(name)`;
  return rows.map((r) => ({ id: r.id, name: r.name, items: hydrate(JSON.parse(r.itemsJson)) }));
}

export async function saveTemplate(userId: number, name: string, items: QuoteItem[]) {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean || !jobKey(clean)) throw new WorkspaceError("Ponle un nombre a la plantilla.");
  const valid = sanitizeItems(items);
  if (!valid.length) throw new WorkspaceError("La plantilla necesita al menos un concepto.");
  const stored: StoredItem[] = valid.map(({ kind, description, quantity, unitPrice }) => ({ kind, description, quantity, unitPrice }));
  const sql = await db();
  await sql`
    INSERT INTO quote_templates (user_id, name, name_key, items_json)
    VALUES (${userId}, ${clean}, ${jobKey(clean)}, ${JSON.stringify(stored)})
    ON CONFLICT (user_id, name_key) DO UPDATE SET name = EXCLUDED.name, items_json = EXCLUDED.items_json`;
}

export async function deleteTemplate(userId: number, id: number) {
  const sql = await db();
  await sql`DELETE FROM quote_templates WHERE id = ${id} AND user_id = ${userId}`;
}

// "Hazme el mantenimiento de 10 mil" → plantilla "Mantenimiento 10.000 km".
export async function matchTemplate(userId: number, message: string): Promise<QuoteTemplate | null> {
  const msg = tokens(jobKey(message));
  let best: QuoteTemplate | null = null;
  let bestSize = 0;
  for (const t of await listTemplates(userId)) {
    const tk = tokens(jobKey(t.name));
    if (tk.size > 0 && [...tk].every((w) => msg.has(w)) && tk.size > bestSize) [best, bestSize] = [t, tk.size];
  }
  return best;
}

function hydrate(items: StoredItem[]): QuoteItem[] {
  return items.map((i) => ({ ...i, key: newItemKey(), productId: null }));
}

// ---------- cotizaciones ----------

const KINDS: QuoteItemKind[] = ["repuesto", "mano_obra", "otro"];

function sanitizeItems(items: QuoteItem[]): QuoteItem[] {
  return items
    .map((i) => ({
      ...i,
      kind: KINDS.includes(i.kind) ? i.kind : "otro",
      description: String(i.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      quantity: Number.isFinite(i.quantity) && i.quantity > 0 ? round2(i.quantity) : 1,
      unitPrice: i.unitPrice == null || !Number.isFinite(i.unitPrice) || i.unitPrice < 0 ? null : round2(i.unitPrice),
    }))
    .filter((i) => i.description);
}

export type SavedQuote = { quoteId: number; number: number; clientId: number | null; vehicleId: number | null };

export async function saveQuote(userId: number, draft: QuoteDraft): Promise<SavedQuote> {
  const items = sanitizeItems(draft.items ?? []);
  if (!items.length) throw new WorkspaceError("La cotización necesita al menos un concepto.");

  return transaction(async (tx) => {
    // Vehículo / cliente: solo se aceptan los del propio taller.
    let vehicleId: number | null = null;
    let clientId: number | null = null;
    if (draft.vehicleId != null) {
      const v = await getVehicle(userId, draft.vehicleId, tx);
      if (!v) throw new WorkspaceError("Vehículo no encontrado.");
      vehicleId = v.id;
      clientId = v.clientId;
    }
    if (draft.clientId != null) {
      const [ok] = await tx`SELECT 1 FROM clients WHERE id = ${draft.clientId} AND user_id = ${userId}`;
      if (!ok) throw new WorkspaceError("Cliente no encontrado.");
      clientId = draft.clientId;
    }
    // Cliente nuevo desde la conversación: se crea ahora, junto con su vehículo.
    if (clientId == null && draft.newClient?.name?.trim()) {
      clientId = await createClient(userId, { name: draft.newClient.name, phone: draft.newClient.phone }, tx);
      if (vehicleId == null && draft.vehicle) {
        const [{ id }] = await tx<{ id: number }[]>`
          INSERT INTO vehicles (user_id, client_id, brand, model, year)
          VALUES (${userId}, ${clientId}, ${draft.vehicle.brand}, ${draft.vehicle.model}, ${draft.vehicle.year ?? null})
          RETURNING id`;
        vehicleId = id;
      }
    }

    const t = quoteTotals({ items, discount: draft.discount });
    const vehicleLabel = draft.vehicle ? [draft.vehicle.brand, draft.vehicle.model, draft.vehicle.year].filter(Boolean).join(" ") : null;
    const title = draft.title?.trim().slice(0, 200) || null;
    const notes = draft.notes?.trim().slice(0, 1000) || null;

    let quoteId: number;
    let number: number;
    if (draft.quoteId != null) {
      const [existing] = await tx<{ id: number; number: number }[]>`
        SELECT id, number FROM quotes WHERE id = ${draft.quoteId} AND user_id = ${userId}`;
      if (!existing) throw new WorkspaceError("Cotización no encontrada.");
      quoteId = existing.id;
      number = existing.number;
      await tx`
        UPDATE quotes SET client_id = ${clientId}, vehicle_id = ${vehicleId}, vehicle_label = ${vehicleLabel}, title = ${title},
               discount = ${t.discount}, notes = ${notes}, total = ${t.total}, updated_at = now()
         WHERE id = ${quoteId} AND user_id = ${userId}`;
      await tx`DELETE FROM quote_items WHERE quote_id = ${quoteId}`;
    } else {
      // Correlativo por taller; el bloqueo evita números repetidos si se guardan dos a la vez.
      await tx`SELECT pg_advisory_xact_lock(${userId})`;
      const [{ n }] = await tx<{ n: number }[]>`SELECT COALESCE(MAX(number), 0)::int AS n FROM quotes WHERE user_id = ${userId}`;
      number = n + 1;
      const [{ id }] = await tx<{ id: number }[]>`
        INSERT INTO quotes (user_id, number, client_id, vehicle_id, vehicle_label, title, discount, notes, total)
        VALUES (${userId}, ${number}, ${clientId}, ${vehicleId}, ${vehicleLabel}, ${title}, ${t.discount}, ${notes}, ${t.total})
        RETURNING id`;
      quoteId = id;
    }

    const productIds = items.map((i) => i.productId).filter((x): x is number => x != null);
    const validProducts = new Set(
      productIds.length ? (await tx<{ id: number }[]>`SELECT id FROM products WHERE id = ANY(${productIds})`).map((r) => r.id) : [],
    );
    await tx`INSERT INTO quote_items ${tx(
      items.map((i, pos) => ({
        quote_id: quoteId,
        position: pos,
        kind: i.kind,
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unitPrice,
        product_id: i.productId != null && validProducts.has(i.productId) ? i.productId : null,
      })),
    )}`;

    // Aprende los precios de mano de obra para sugerirlos la próxima vez
    // (solo si el nombre identifica el trabajo; "Mano de obra" a secas no se aprende)
    for (const i of items) {
      if (i.kind === "mano_obra" && i.unitPrice != null && i.quantity === 1 && jobKey(i.description)) {
        await upsertLaborPrice(userId, i.description, i.unitPrice, tx);
      }
    }
    return { quoteId, number, clientId, vehicleId };
  });
}

export type QuoteRow = {
  id: number;
  number: number;
  clientName: string | null;
  vehicleLabel: string | null;
  total: number;
  status: QuoteStatus;
  createdAt: string;
};

export async function listQuotes(userId: number): Promise<QuoteRow[]> {
  const sql = await db();
  return [...(await sql<QuoteRow[]>`
    SELECT q.id, q.number, c.name AS "clientName",
           COALESCE(TRIM(v.brand || ' ' || v.model || COALESCE(' ' || v.year, '')), q.vehicle_label) AS "vehicleLabel",
           q.total, q.status, q.created_at AS "createdAt"
      FROM quotes q
      LEFT JOIN clients c ON c.id = q.client_id AND c.user_id = q.user_id
      LEFT JOIN vehicles v ON v.id = q.vehicle_id AND v.user_id = q.user_id
     WHERE q.user_id = ${userId} ORDER BY q.number DESC`)];
}

export async function getQuoteDraft(userId: number, quoteId: number): Promise<QuoteDraft | null> {
  if (!Number.isInteger(quoteId)) return null;
  const sql = await db();
  const [q] = await sql<{
    id: number; number: number; status: QuoteStatus; title: string | null; discount: number; notes: string | null;
    vehicleId: number | null; clientId: number | null; vehicleLabel: string | null; brand: string | null;
    model: string | null; year: number | null; clientName: string | null; clientPhone: string | null;
  }[]>`
    SELECT q.id, q.number, q.status, q.title, q.discount, q.notes, q.vehicle_id AS "vehicleId", q.client_id AS "clientId",
           q.vehicle_label AS "vehicleLabel", v.brand, v.model, v.year, c.name AS "clientName", c.phone AS "clientPhone"
      FROM quotes q
      LEFT JOIN vehicles v ON v.id = q.vehicle_id AND v.user_id = q.user_id
      LEFT JOIN clients c ON c.id = q.client_id AND c.user_id = q.user_id
     WHERE q.id = ${quoteId} AND q.user_id = ${userId}`;
  if (!q) return null;
  const items = await sql<Omit<QuoteItem, "key">[]>`
    SELECT kind, description, quantity, unit_price AS "unitPrice", product_id AS "productId"
      FROM quote_items WHERE quote_id = ${q.id} ORDER BY position`;

  // Vehículo: el registrado o, si no hay, el texto guardado ("Chevrolet Aveo 2010").
  let vehicle: QuoteDraft["vehicle"] = null;
  if (q.brand && q.model) vehicle = { brand: q.brand, model: q.model, year: q.year };
  else if (q.vehicleLabel) {
    const m = q.vehicleLabel.match(/^(.*?)(?:\s+(\d{4}))?$/);
    vehicle = { brand: "", model: m?.[1] ?? q.vehicleLabel, year: m?.[2] ? Number(m[2]) : null };
  }

  return {
    quoteId: q.id,
    number: q.number,
    status: q.status,
    title: q.title ?? "",
    vehicle,
    vehicleId: q.vehicleId,
    clientId: q.clientId,
    clientName: q.clientName,
    clientPhone: q.clientPhone,
    newClient: null,
    items: items.map((i) => ({ ...i, key: newItemKey() })),
    discount: q.discount,
    notes: q.notes ?? "",
  };
}

export async function setQuoteStatus(userId: number, quoteId: number, status: QuoteStatus) {
  if (!["borrador", "enviada", "aprobada", "rechazada"].includes(status)) throw new WorkspaceError("Estado no válido.");
  const sql = await db();
  const r = await sql`UPDATE quotes SET status = ${status}, updated_at = now() WHERE id = ${quoteId} AND user_id = ${userId}`;
  if (r.count === 0) throw new WorkspaceError("Cotización no encontrada.");
}

// Vehículos del taller que coinciden con el de la conversación (para asociar).
export async function matchingVehicles(userId: number, v: { brand: string; model: string; year: number | null } | null) {
  const sql = await db();
  const rows = await sql<{ id: number; brand: string; model: string; year: number | null; plate: string | null; clientName: string | null }[]>`
    SELECT v.id, v.brand, v.model, v.year, v.plate, c.name AS "clientName"
      FROM vehicles v LEFT JOIN clients c ON c.id = v.client_id AND c.user_id = v.user_id
     WHERE v.user_id = ${userId} ORDER BY v.id DESC`;
  if (!v) return rows.slice(0, 5);
  const model = normalizeText(v.model);
  return rows.filter((r) => normalizeText(r.model) === model && (v.year == null || r.year == null || r.year === v.year)).slice(0, 5);
}

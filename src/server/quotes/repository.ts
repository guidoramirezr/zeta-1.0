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
import { db, transaction } from "@/server/db/client";
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

export function getWorkshopName(userId: number): string | null {
  const r = db().prepare("SELECT COALESCE(workshop_name, name) AS n FROM users WHERE id = ?").get(userId) as { n: string | null } | undefined;
  return r?.n ?? null;
}

export function setWorkshopName(userId: number, name: string) {
  db().prepare("UPDATE users SET workshop_name = ? WHERE id = ?").run(name.trim() || null, userId);
}

// ---------- precios de mano de obra ----------

export type LaborPrice = { id: number; name: string; price: number };

export function listLaborPrices(userId: number): LaborPrice[] {
  return db()
    .prepare("SELECT id, name, price FROM labor_prices WHERE user_id = ? ORDER BY name COLLATE NOCASE")
    .all(userId) as unknown as LaborPrice[];
}

export function upsertLaborPrice(userId: number, name: string, price: number) {
  const clean = name.replace(/\s+/g, " ").trim();
  const key = jobKey(clean);
  if (!clean || !key) throw new WorkspaceError("Escribe el nombre del trabajo.");
  if (!Number.isFinite(price) || price < 0) throw new WorkspaceError("El precio no es válido.");
  db()
    .prepare(
      `INSERT INTO labor_prices (user_id, name, name_key, price) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, name_key) DO UPDATE SET name = excluded.name, price = excluded.price, updated_at = datetime('now')`,
    )
    .run(userId, clean, key, round2(price));
}

export function deleteLaborPrice(userId: number, id: number) {
  db().prepare("DELETE FROM labor_prices WHERE id = ? AND user_id = ?").run(id, userId);
}

// Precio habitual para un trabajo: igual, o muy parecido (≥ 60% palabras en común).
export function suggestLaborPrice(userId: number, jobTitle: string): LaborPrice | null {
  const key = jobKey(jobTitle);
  if (!key) return null;
  const all = db()
    .prepare("SELECT id, name, name_key AS nameKey, price FROM labor_prices WHERE user_id = ?")
    .all(userId) as unknown as (LaborPrice & { nameKey: string })[];
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

export function listTemplates(userId: number): QuoteTemplate[] {
  const rows = db()
    .prepare("SELECT id, name, items_json AS itemsJson FROM quote_templates WHERE user_id = ? ORDER BY name COLLATE NOCASE")
    .all(userId) as { id: number; name: string; itemsJson: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, items: hydrate(JSON.parse(r.itemsJson)) }));
}

export function saveTemplate(userId: number, name: string, items: QuoteItem[]) {
  const clean = name.replace(/\s+/g, " ").trim();
  if (!clean || !jobKey(clean)) throw new WorkspaceError("Ponle un nombre a la plantilla.");
  const valid = sanitizeItems(items);
  if (!valid.length) throw new WorkspaceError("La plantilla necesita al menos un concepto.");
  const stored: StoredItem[] = valid.map(({ kind, description, quantity, unitPrice }) => ({ kind, description, quantity, unitPrice }));
  db()
    .prepare(
      `INSERT INTO quote_templates (user_id, name, name_key, items_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, name_key) DO UPDATE SET name = excluded.name, items_json = excluded.items_json`,
    )
    .run(userId, clean, jobKey(clean), JSON.stringify(stored));
}

export function deleteTemplate(userId: number, id: number) {
  db().prepare("DELETE FROM quote_templates WHERE id = ? AND user_id = ?").run(id, userId);
}

// "Hazme el mantenimiento de 10 mil" → plantilla "Mantenimiento 10.000 km".
export function matchTemplate(userId: number, message: string): QuoteTemplate | null {
  const msg = tokens(jobKey(message));
  let best: QuoteTemplate | null = null;
  let bestSize = 0;
  for (const t of listTemplates(userId)) {
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

export function saveQuote(userId: number, draft: QuoteDraft): SavedQuote {
  const items = sanitizeItems(draft.items ?? []);
  if (!items.length) throw new WorkspaceError("La cotización necesita al menos un concepto.");
  const conn = db();

  return transaction(conn, () => {
    // Vehículo / cliente: solo se aceptan los del propio taller.
    let vehicleId: number | null = null;
    let clientId: number | null = null;
    if (draft.vehicleId != null) {
      const v = getVehicle(userId, draft.vehicleId);
      if (!v) throw new WorkspaceError("Vehículo no encontrado.");
      vehicleId = v.id;
      clientId = v.clientId;
    }
    if (draft.clientId != null) {
      const ok = conn.prepare("SELECT 1 FROM clients WHERE id = ? AND user_id = ?").get(draft.clientId, userId);
      if (!ok) throw new WorkspaceError("Cliente no encontrado.");
      clientId = draft.clientId;
    }
    // Cliente nuevo desde la conversación: se crea ahora, junto con su vehículo.
    if (clientId == null && draft.newClient?.name?.trim()) {
      clientId = createClient(userId, { name: draft.newClient.name, phone: draft.newClient.phone });
      if (vehicleId == null && draft.vehicle) {
        const r = conn
          .prepare("INSERT INTO vehicles (user_id, client_id, brand, model, year) VALUES (?, ?, ?, ?, ?)")
          .run(userId, clientId, draft.vehicle.brand, draft.vehicle.model, draft.vehicle.year ?? null);
        vehicleId = Number(r.lastInsertRowid);
      }
    }

    const t = quoteTotals({ items, discount: draft.discount });
    const vehicleLabel = draft.vehicle ? [draft.vehicle.brand, draft.vehicle.model, draft.vehicle.year].filter(Boolean).join(" ") : null;
    const title = draft.title?.trim().slice(0, 200) || null;
    const notes = draft.notes?.trim().slice(0, 1000) || null;

    let quoteId: number;
    let number: number;
    if (draft.quoteId != null) {
      const existing = conn.prepare("SELECT id, number FROM quotes WHERE id = ? AND user_id = ?").get(draft.quoteId, userId) as
        | { id: number; number: number }
        | undefined;
      if (!existing) throw new WorkspaceError("Cotización no encontrada.");
      quoteId = existing.id;
      number = existing.number;
      conn
        .prepare(
          `UPDATE quotes SET client_id = ?, vehicle_id = ?, vehicle_label = ?, title = ?, discount = ?, notes = ?,
                  total = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
        )
        .run(clientId, vehicleId, vehicleLabel, title, t.discount, notes, t.total, quoteId, userId);
      conn.prepare("DELETE FROM quote_items WHERE quote_id = ?").run(quoteId);
    } else {
      number = ((conn.prepare("SELECT MAX(number) AS n FROM quotes WHERE user_id = ?").get(userId) as { n: number | null }).n ?? 0) + 1;
      const r = conn
        .prepare(
          `INSERT INTO quotes (user_id, number, client_id, vehicle_id, vehicle_label, title, discount, notes, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(userId, number, clientId, vehicleId, vehicleLabel, title, t.discount, notes, t.total);
      quoteId = Number(r.lastInsertRowid);
    }

    const insert = conn.prepare(
      `INSERT INTO quote_items (quote_id, position, kind, description, quantity, unit_price, product_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    items.forEach((i, pos) => {
      const productId = i.productId != null && conn.prepare("SELECT 1 FROM products WHERE id = ?").get(i.productId) ? i.productId : null;
      insert.run(quoteId, pos, i.kind, i.description, i.quantity, i.unitPrice, productId);
    });

    // Aprende los precios de mano de obra para sugerirlos la próxima vez.
    for (const i of items) {
      // (solo si el nombre identifica el trabajo; "Mano de obra" a secas no se aprende)
      if (i.kind === "mano_obra" && i.unitPrice != null && i.quantity === 1 && jobKey(i.description)) {
        upsertLaborPrice(userId, i.description, i.unitPrice);
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

export function listQuotes(userId: number): QuoteRow[] {
  return db()
    .prepare(
      `SELECT q.id, q.number, c.name AS clientName,
              COALESCE(TRIM(v.brand || ' ' || v.model || COALESCE(' ' || v.year, '')), q.vehicle_label) AS vehicleLabel,
              q.total, q.status, q.created_at AS createdAt
         FROM quotes q
         LEFT JOIN clients c ON c.id = q.client_id AND c.user_id = q.user_id
         LEFT JOIN vehicles v ON v.id = q.vehicle_id AND v.user_id = q.user_id
        WHERE q.user_id = ? ORDER BY q.number DESC`,
    )
    .all(userId) as unknown as QuoteRow[];
}

export function getQuoteDraft(userId: number, quoteId: number): QuoteDraft | null {
  const conn = db();
  const q = conn
    .prepare(
      `SELECT q.id, q.number, q.status, q.title, q.discount, q.notes, q.vehicle_id AS vehicleId, q.client_id AS clientId,
              q.vehicle_label AS vehicleLabel, v.brand, v.model, v.year, c.name AS clientName, c.phone AS clientPhone
         FROM quotes q
         LEFT JOIN vehicles v ON v.id = q.vehicle_id AND v.user_id = q.user_id
         LEFT JOIN clients c ON c.id = q.client_id AND c.user_id = q.user_id
        WHERE q.id = ? AND q.user_id = ?`,
    )
    .get(quoteId, userId) as
    | {
        id: number; number: number; status: QuoteStatus; title: string | null; discount: number; notes: string | null;
        vehicleId: number | null; clientId: number | null; vehicleLabel: string | null; brand: string | null;
        model: string | null; year: number | null; clientName: string | null; clientPhone: string | null;
      }
    | undefined;
  if (!q) return null;
  const items = conn
    .prepare(
      `SELECT kind, description, quantity, unit_price AS unitPrice, product_id AS productId
         FROM quote_items WHERE quote_id = ? ORDER BY position`,
    )
    .all(q.id) as Omit<QuoteItem, "key">[];

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

export function setQuoteStatus(userId: number, quoteId: number, status: QuoteStatus) {
  if (!["borrador", "enviada", "aprobada", "rechazada"].includes(status)) throw new WorkspaceError("Estado no válido.");
  const r = db()
    .prepare("UPDATE quotes SET status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(status, quoteId, userId);
  if (r.changes === 0) throw new WorkspaceError("Cotización no encontrada.");
}

// Vehículos del taller que coinciden con el de la conversación (para asociar).
export function matchingVehicles(userId: number, v: { brand: string; model: string; year: number | null } | null) {
  const rows = db()
    .prepare(
      `SELECT v.id, v.brand, v.model, v.year, v.plate, c.name AS clientName
         FROM vehicles v LEFT JOIN clients c ON c.id = v.client_id AND c.user_id = v.user_id
        WHERE v.user_id = ? ORDER BY v.id DESC`,
    )
    .all(userId) as { id: number; brand: string; model: string; year: number | null; plate: string | null; clientName: string | null }[];
  if (!v) return rows.slice(0, 5);
  const model = normalizeText(v.model);
  return rows.filter((r) => normalizeText(r.model) === model && (v.year == null || r.year == null || r.year === v.year)).slice(0, 5);
}

import "server-only";
import { db, transaction, type Q } from "@/server/db/client";

// "Mi Zeta": datos PRIVADOS del mecánico.
// Regla: toda función recibe userId (de la sesión, nunca del navegador) y
// todas las consultas filtran por user_id. Un mecánico jamás ve datos de otro.

export class WorkspaceError extends Error {}

export type Client = { id: number; name: string; phone: string | null; email: string | null; notes: string | null; vehicles: number };

export type Vehicle = {
  id: number;
  clientId: number | null;
  clientName: string | null;
  clientPhone: string | null;
  plate: string | null;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  fuel: string | null;
  mileage: number | null;
  notes: string | null;
  lastServiceDate: string | null;
};

export type Maintenance = {
  id: number;
  date: string;
  mileage: number | null;
  work: string;
  parts: string | null;
  nextMileage: number | null;
  nextDate: string | null;
  notes: string | null;
};

export type Upcoming = {
  vehicleId: number;
  label: string;
  clientName: string | null;
  mileage: number | null;
  nextMileage: number | null;
  nextDate: string | null;
  due: boolean;
};

// ---------- clientes ----------

export async function listClients(userId: number): Promise<Client[]> {
  const sql = await db();
  return [...(await sql<Client[]>`
    SELECT c.id, c.name, c.phone, c.email, c.notes, COUNT(v.id)::int AS vehicles
      FROM clients c LEFT JOIN vehicles v ON v.client_id = c.id AND v.user_id = c.user_id
     WHERE c.user_id = ${userId} GROUP BY c.id ORDER BY lower(c.name)`)];
}

export async function createClient(
  userId: number,
  d: { name: string; phone?: string | null; email?: string | null; notes?: string | null },
  q?: Q,
): Promise<number> {
  const name = clean(d.name);
  if (!name) throw new WorkspaceError("El nombre del cliente es obligatorio.");
  const sql = q ?? (await db());
  const [{ id }] = await sql<{ id: number }[]>`
    INSERT INTO clients (user_id, name, phone, email, notes)
    VALUES (${userId}, ${name}, ${clean(d.phone)}, ${clean(d.email)}, ${clean(d.notes)}) RETURNING id`;
  return id;
}

async function assertClientOwned(sql: Q, userId: number, clientId: number) {
  const [ok] = await sql`SELECT 1 FROM clients WHERE id = ${clientId} AND user_id = ${userId}`;
  if (!ok) throw new WorkspaceError("Cliente no encontrado.");
}

// ---------- vehículos ----------

function vehicleSelect(sql: Q) {
  return sql`
    SELECT v.id, v.client_id AS "clientId", c.name AS "clientName", c.phone AS "clientPhone", v.plate, v.brand, v.model,
           v.year, v.engine, v.fuel, v.mileage, v.notes,
           (SELECT MAX(m.date) FROM maintenances m WHERE m.vehicle_id = v.id AND m.user_id = v.user_id) AS "lastServiceDate"
      FROM vehicles v LEFT JOIN clients c ON c.id = v.client_id AND c.user_id = v.user_id`;
}

export async function listVehicles(userId: number): Promise<Vehicle[]> {
  const sql = await db();
  return [...(await sql<Vehicle[]>`${vehicleSelect(sql)} WHERE v.user_id = ${userId} ORDER BY v.brand, v.model`)];
}

export async function getVehicle(userId: number, vehicleId: number, q?: Q): Promise<Vehicle | null> {
  if (!Number.isInteger(vehicleId)) return null;
  const sql = q ?? (await db());
  const [v] = await sql<Vehicle[]>`${vehicleSelect(sql)} WHERE v.user_id = ${userId} AND v.id = ${vehicleId}`;
  return v ?? null;
}

export async function createVehicle(
  userId: number,
  d: {
    clientId?: number | null;
    newClientName?: string | null;
    newClientPhone?: string | null;
    plate?: string | null;
    brand: string;
    model: string;
    year?: number | null;
    engine?: string | null;
    fuel?: string | null;
    mileage?: number | null;
    notes?: string | null;
  },
): Promise<number> {
  const brand = clean(d.brand);
  const model = clean(d.model);
  if (!brand || !model) throw new WorkspaceError("Marca y modelo son obligatorios.");
  if (d.year != null && (d.year < 1950 || d.year > new Date().getFullYear() + 1)) {
    throw new WorkspaceError("El año no es válido.");
  }
  if (d.mileage != null && d.mileage < 0) throw new WorkspaceError("El kilometraje no es válido.");

  return transaction(async (tx) => {
    let clientId = d.clientId ?? null;
    if (clientId != null) await assertClientOwned(tx, userId, clientId);
    else if (clean(d.newClientName)) clientId = await createClient(userId, { name: d.newClientName!, phone: d.newClientPhone }, tx);

    const [{ id }] = await tx<{ id: number }[]>`
      INSERT INTO vehicles (user_id, client_id, plate, brand, model, year, engine, fuel, mileage, notes)
      VALUES (${userId}, ${clientId}, ${clean(d.plate)?.toUpperCase() ?? null}, ${brand}, ${model}, ${d.year ?? null},
              ${clean(d.engine)}, ${clean(d.fuel)}, ${d.mileage ?? null}, ${clean(d.notes)})
      RETURNING id`;
    return id;
  });
}

// ---------- mantenimientos ----------

export async function listMaintenances(userId: number, vehicleId: number): Promise<Maintenance[]> {
  const sql = await db();
  return [...(await sql<Maintenance[]>`
    SELECT id, date, mileage, work, parts, next_mileage AS "nextMileage", next_date AS "nextDate", notes
      FROM maintenances WHERE user_id = ${userId} AND vehicle_id = ${vehicleId}
     ORDER BY date DESC, id DESC`)];
}

export type AddMaintenanceResult = { ok: true } | { ok: false; lowerMileage: { last: number; entered: number } };

export async function addMaintenance(
  userId: number,
  d: {
    vehicleId: number;
    date: string;
    mileage?: number | null;
    work: string;
    parts?: string | null;
    nextMileage?: number | null;
    nextDate?: string | null;
    notes?: string | null;
  },
  opts: { confirmLowerMileage: boolean },
): Promise<AddMaintenanceResult> {
  const vehicle = await getVehicle(userId, d.vehicleId);
  if (!vehicle) throw new WorkspaceError("Vehículo no encontrado.");
  const work = clean(d.work);
  if (!work) throw new WorkspaceError("Describe el trabajo realizado.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new WorkspaceError("La fecha no es válida.");
  if (d.nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(d.nextDate)) throw new WorkspaceError("La fecha del próximo mantenimiento no es válida.");
  if (d.mileage != null && d.mileage < 0) throw new WorkspaceError("El kilometraje no es válido.");
  if (d.nextMileage != null && d.mileage != null && d.nextMileage <= d.mileage) {
    throw new WorkspaceError("El kilometraje del próximo mantenimiento debe ser mayor al actual.");
  }

  // Kilometraje menor al último registrado: pedir confirmación.
  if (d.mileage != null && vehicle.mileage != null && d.mileage < vehicle.mileage && !opts.confirmLowerMileage) {
    return { ok: false, lowerMileage: { last: vehicle.mileage, entered: d.mileage } };
  }

  await transaction(async (tx) => {
    await tx`
      INSERT INTO maintenances (user_id, vehicle_id, date, mileage, work, parts, next_mileage, next_date, notes)
      VALUES (${userId}, ${d.vehicleId}, ${d.date}, ${d.mileage ?? null}, ${work}, ${clean(d.parts)},
              ${d.nextMileage ?? null}, ${d.nextDate || null}, ${clean(d.notes)})`;
    // El kilometraje actual solo sube (si el nuevo es mayor o no había).
    if (d.mileage != null && (vehicle.mileage == null || d.mileage > vehicle.mileage)) {
      await tx`UPDATE vehicles SET mileage = ${d.mileage} WHERE id = ${d.vehicleId} AND user_id = ${userId}`;
    }
  });
  return { ok: true };
}

// ---------- inicio ----------

export async function workspaceSummary(userId: number) {
  const sql = await db();
  const [counts] = await sql<{ vehicles: number; clients: number; maintenances: number }[]>`
    SELECT (SELECT COUNT(*)::int FROM vehicles WHERE user_id = ${userId}) AS vehicles,
           (SELECT COUNT(*)::int FROM clients WHERE user_id = ${userId}) AS clients,
           (SELECT COUNT(*)::int FROM maintenances WHERE user_id = ${userId}) AS maintenances`;
  const upcoming = await listUpcoming(userId);
  return { ...counts, upcoming, dueCount: upcoming.filter((u) => u.due).length };
}

// Próximo mantenimiento = el indicado en el último registro que lo tenga
// (una revisión menor sin "próximo" no borra el recordatorio anterior).
// "Pendiente" si faltan ≤ 1.000 km o ≤ 15 días (o ya se pasó).
export async function listUpcoming(userId: number): Promise<Upcoming[]> {
  const sql = await db();
  const rows = await sql<{
    vehicleId: number; brand: string; model: string; year: number | null; mileage: number | null;
    clientName: string | null; nextMileage: number | null; nextDate: string | null;
  }[]>`
    SELECT v.id AS "vehicleId", v.brand, v.model, v.year, v.mileage, c.name AS "clientName",
           m.next_mileage AS "nextMileage", m.next_date AS "nextDate"
      FROM vehicles v
      LEFT JOIN clients c ON c.id = v.client_id AND c.user_id = v.user_id
      JOIN maintenances m ON m.id = (
           SELECT id FROM maintenances WHERE vehicle_id = v.id AND user_id = v.user_id
              AND (next_mileage IS NOT NULL OR next_date IS NOT NULL)
            ORDER BY date DESC, id DESC LIMIT 1)
     WHERE v.user_id = ${userId}`;

  const soon = new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10);
  return rows
    .map((r) => ({
      vehicleId: r.vehicleId,
      label: [r.brand, r.model, r.year].filter(Boolean).join(" "),
      clientName: r.clientName,
      mileage: r.mileage,
      nextMileage: r.nextMileage,
      nextDate: r.nextDate,
      due:
        (r.nextMileage != null && r.mileage != null && r.nextMileage - r.mileage <= 1000) ||
        (r.nextDate != null && r.nextDate <= soon),
    }))
    .sort((a, b) => Number(b.due) - Number(a.due));
}

function clean(v: string | null | undefined): string | null {
  const s = v?.replace(/\s+/g, " ").trim();
  return s ? s : null;
}

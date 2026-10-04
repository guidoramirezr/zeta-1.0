"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { WorkspaceError, addMaintenance, createClient, createVehicle } from "@/server/workspace/repository";

// Cada acción obtiene el usuario de la SESIÓN (nunca del formulario).

export type FormState = { error?: string; lowerMileage?: { last: number; entered: number }; ok?: boolean } | null;

export async function createVehicleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  let id: number;
  try {
    const clientId = str(fd, "clientId");
    id = await createVehicle(user.id, {
      clientId: clientId && clientId !== "new" ? Number(clientId) : null,
      newClientName: clientId === "new" ? str(fd, "newClientName") : null,
      newClientPhone: clientId === "new" ? str(fd, "newClientPhone") : null,
      plate: str(fd, "plate"),
      brand: str(fd, "brand") ?? "",
      model: str(fd, "model") ?? "",
      year: int(fd, "year"),
      engine: str(fd, "engine"),
      fuel: str(fd, "fuel"),
      mileage: int(fd, "mileage"),
      notes: str(fd, "notes"),
    });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/mi-zeta", "layout");
  redirect(`/mi-zeta/vehiculos/${id}`);
}

export async function createClientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser("/mi-zeta/clientes");
  try {
    await createClient(user.id, { name: str(fd, "name") ?? "", phone: str(fd, "phone"), email: str(fd, "email"), notes: str(fd, "notes") });
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/mi-zeta", "layout");
  return { ok: true };
}

export async function addMaintenanceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const vehicleId = Number(str(fd, "vehicleId"));
  try {
    const r = await addMaintenance(
      user.id,
      {
        vehicleId,
        date: str(fd, "date") ?? "",
        mileage: int(fd, "mileage"),
        work: str(fd, "work") ?? "",
        parts: str(fd, "parts"),
        nextMileage: int(fd, "nextMileage"),
        nextDate: str(fd, "nextDate"),
        notes: str(fd, "notes"),
      },
      { confirmLowerMileage: fd.get("confirmLowerMileage") === "1" },
    );
    if (!r.ok) return { lowerMileage: r.lowerMileage };
  } catch (err) {
    return { error: message(err) };
  }
  revalidatePath("/mi-zeta", "layout");
  return { ok: true };
}

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// "182.450" / "182,450" / "182 450 km" → 182450
function int(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (!s) return null;
  const n = Number(s.replace(/[.,\s]|km/gi, ""));
  if (!Number.isInteger(n)) throw new WorkspaceError(`"${s}" no es un número válido.`);
  return n;
}

function message(err: unknown) {
  if (err instanceof WorkspaceError) return err.message;
  console.error("[mi-zeta]", err);
  return "Ocurrió un error. Intenta de nuevo.";
}

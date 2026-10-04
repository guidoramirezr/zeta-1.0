"use server";

import { revalidatePath } from "next/cache";
import type { QuoteDraft, QuoteItem, QuoteStatus } from "@/core/quotes/types";
import { requireUser } from "@/server/auth/session";
import {
  deleteLaborPrice,
  deleteTemplate,
  getWorkshopName,
  saveQuote,
  saveTemplate,
  setQuoteStatus,
  setWorkshopName,
  upsertLaborPrice,
} from "@/server/quotes/repository";
import { WorkspaceError } from "@/server/workspace/repository";

// Acciones del cotizador. El usuario SIEMPRE sale de la sesión.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function saveQuoteAction(draft: QuoteDraft): Promise<
  Result<{ quoteId: number; number: number; clientId: number | null; vehicleId: number | null; workshopName: string | null }>
> {
  const user = await requireUser("/");
  try {
    const saved = await saveQuote(user.id, draft);
    revalidatePath("/mi-zeta", "layout");
    return { ok: true, ...saved, workshopName: await getWorkshopName(user.id) };
  } catch (err) {
    return fail(err);
  }
}

export async function setQuoteStatusAction(quoteId: number, status: QuoteStatus): Promise<Result> {
  const user = await requireUser("/mi-zeta/cotizaciones");
  try {
    await setQuoteStatus(user.id, quoteId, status);
    revalidatePath("/mi-zeta", "layout");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function saveTemplateAction(name: string, items: QuoteItem[]): Promise<Result> {
  const user = await requireUser("/");
  try {
    await saveTemplate(user.id, name, items);
    revalidatePath("/mi-zeta/cotizaciones");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTemplateAction(id: number) {
  const user = await requireUser("/mi-zeta/cotizaciones");
  await deleteTemplate(user.id, id);
  revalidatePath("/mi-zeta/cotizaciones");
}

export async function saveLaborPriceAction(_prev: Result | null, fd: FormData): Promise<Result> {
  const user = await requireUser("/mi-zeta/cotizaciones");
  try {
    const price = Number(String(fd.get("price") ?? "").replace(",", ".").replace("$", "").trim());
    await upsertLaborPrice(user.id, String(fd.get("name") ?? ""), price);
    revalidatePath("/mi-zeta/cotizaciones");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteLaborPriceAction(id: number) {
  const user = await requireUser("/mi-zeta/cotizaciones");
  await deleteLaborPrice(user.id, id);
  revalidatePath("/mi-zeta/cotizaciones");
}

export async function saveWorkshopNameAction(_prev: Result | null, fd: FormData): Promise<Result> {
  const user = await requireUser("/mi-zeta/cotizaciones");
  await setWorkshopName(user.id, String(fd.get("workshopName") ?? "").slice(0, 120));
  revalidatePath("/mi-zeta/cotizaciones");
  return { ok: true };
}

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof WorkspaceError) return { ok: false, error: err.message };
  console.error("[cotizador]", err);
  return { ok: false, error: "Ocurrió un error. Intenta de nuevo." };
}

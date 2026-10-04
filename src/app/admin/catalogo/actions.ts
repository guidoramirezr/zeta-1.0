"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { ImportFormatError, parseCatalogFile } from "@/server/catalog/import/parse";
import { applyImport, previewImport, type ImportOptions, type ImportPreview } from "@/server/catalog/import/plan";

// Solo administradores (correos en ZETA_ADMIN_EMAILS).

const MAX_BYTES = 10 * 1024 * 1024;

export type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; error: string };
export type ImportResult =
  | { ok: true; created: number; updated: number; unchanged: number; errorRows: number }
  | { ok: false; error: string };

async function readForm(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ImportFormatError("Selecciona un archivo Excel.");
  if (file.size > MAX_BYTES) throw new ImportFormatError("El archivo pesa más de 10 MB.");
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new ImportFormatError("El archivo debe ser .xlsx (Excel). Si es .xls o .csv, ábrelo y guárdalo como .xlsx.");
  }
  const marginRaw = String(formData.get("marginPct") ?? "").replace(",", ".").trim();
  const marginPct = marginRaw === "" ? null : Number(marginRaw);
  if (marginPct != null && (!Number.isFinite(marginPct) || marginPct < 0 || marginPct > 1000)) {
    throw new ImportFormatError("El margen debe ser un número entre 0 y 1000.");
  }
  const parsed = await parseCatalogFile(await file.arrayBuffer());
  const opts: ImportOptions = { marginPct };
  return { file, parsed, opts };
}

function errorMessage(err: unknown) {
  if (err instanceof ImportFormatError) return err.message;
  console.error("[catalog-import]", err);
  return "Ocurrió un error inesperado al leer el archivo.";
}

export async function previewCatalogImport(formData: FormData): Promise<PreviewResult> {
  await requireAdmin("/admin/catalogo");
  try {
    const { parsed, opts } = await readForm(formData);
    return { ok: true, preview: await previewImport(parsed, opts) };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function confirmCatalogImport(formData: FormData): Promise<ImportResult> {
  await requireAdmin("/admin/catalogo");
  try {
    const { file, parsed, opts } = await readForm(formData);
    const result = await applyImport(parsed, opts, file.name);
    console.info("[catalog-import]", file.name, parsed.format, result, `errores: ${parsed.errors.length}`);
    revalidatePath("/admin/catalogo");
    return { ok: true, ...result, errorRows: parsed.errors.length };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

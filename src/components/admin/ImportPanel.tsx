"use client";

import { useRef, useState, useTransition } from "react";
import {
  confirmCatalogImport,
  previewCatalogImport,
  type ImportResult,
  type PreviewResult,
} from "@/app/admin/catalogo/actions";
import { formatCount } from "@/lib/format";

// Flujo: elegir archivo → Revisar (no guarda nada) → Importar (guarda) → resultado.
export function ImportPanel() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setPreview(null);
    setResult(null);
  }

  function review() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => setPreview(await previewCatalogImport(data)));
  }

  function confirm() {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    startTransition(async () => {
      const r = await confirmCatalogImport(data);
      setResult(r);
      if (r.ok) {
        setPreview(null);
        formRef.current?.reset();
      }
    });
  }

  const p = preview?.ok ? preview.preview : null;
  const changesCount = p ? p.created + p.updated : 0;

  return (
    <section className="rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Importar productos desde Excel</h2>
          <p className="mt-1 text-sm text-[var(--z-muted)]">
            Acepta la plantilla Zeta o la lista de precios de Sanauto tal como llega.
          </p>
        </div>
        <a
          href="/admin/catalogo/plantilla"
          className="rounded-full border border-[var(--z-line)] px-3.5 py-1.5 text-sm hover:border-[var(--z-ink)]"
        >
          ↓ Descargar plantilla
        </a>
      </div>

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          review();
        }}
        onChange={reset}
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--z-muted)]">Archivo (.xlsx)</span>
          <input
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="w-full rounded-xl border border-[var(--z-line)] bg-[var(--z-bg)] p-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[var(--z-soft)] file:px-3 file:py-1 file:text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--z-muted)]">Margen % (si falta Precio Zeta)</span>
          <input
            name="marginPct"
            type="text"
            inputMode="decimal"
            placeholder="ej. 35"
            className="w-full rounded-xl border border-[var(--z-line)] bg-[var(--z-bg)] px-3 py-2 text-sm sm:w-48"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-[var(--z-ink)] px-5 py-2.5 text-sm font-medium text-[var(--z-on-ink)] disabled:opacity-50"
        >
          {isPending && !p ? "Revisando…" : "Revisar archivo"}
        </button>
      </form>

      {preview && !preview.ok && <Alert tone="error">{preview.error}</Alert>}
      {result && !result.ok && <Alert tone="error">{result.error}</Alert>}
      {result?.ok && (
        <Alert tone="ok">
          Importación lista: {formatCount(result.created)} nuevos, {formatCount(result.updated)} actualizados,{" "}
          {formatCount(result.unchanged)} sin cambios
          {result.errorRows > 0 && `, ${formatCount(result.errorRows)} filas con errores no se importaron`}.
        </Alert>
      )}

      {p && (
        <div className="mt-5 grid gap-4 border-t border-[var(--z-line)] pt-5">
          <p className="text-sm text-[var(--z-muted)]">
            Formato detectado: <strong className="text-[var(--z-text)]">{p.formatLabel}</strong>. Todavía no se
            guardó nada.
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Filas en el archivo" value={p.totalRows} />
            <Stat label="Válidas" value={p.validRows} />
            <Stat label="Con errores" value={p.errorRows} warn={p.errorRows > 0} />
            <Stat label="Quedarían sin Precio Zeta" value={p.withoutPrice} warn={p.withoutPrice > 0} />
            <Stat label="Nuevos" value={p.created} />
            <Stat label="Se actualizan" value={p.updated} />
            <Stat label="Sin cambios" value={p.unchanged} />
          </div>

          {p.newCompanies.length > 0 && (
            <p className="text-sm">
              Empresas nuevas que se crearán: <strong>{p.newCompanies.join(", ")}</strong>
            </p>
          )}
          {p.notInFile.map((n) => (
            <p key={n.company} className="text-sm text-[var(--z-muted)]">
              {formatCount(n.count)} productos de {n.company} ya cargados no vienen en este archivo. No se borrarán.
            </p>
          ))}
          {p.withoutPrice > 0 && (
            <p className="text-sm text-[var(--z-muted)]">
              Los productos sin Precio Zeta se guardan, pero en el chat aparecerán como “precio por confirmar”. Puedes
              poner un margen % arriba y volver a revisar.
            </p>
          )}

          {p.sampleChanges.length > 0 && (
            <Details title={`Cambios en productos existentes (primeros ${p.sampleChanges.length})`}>
              <table className="w-full text-left text-sm">
                <tbody>
                  {p.sampleChanges.map((c, i) => (
                    <tr key={i} className="border-t border-[var(--z-line)]">
                      <td className="py-1.5 pr-3 font-mono text-xs">{c.code}</td>
                      <td className="py-1.5 pr-3">{c.field}</td>
                      <td className="py-1.5 pr-3 text-[var(--z-muted)] line-through">{c.before}</td>
                      <td className="py-1.5">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Details>
          )}

          {p.errors.length > 0 && (
            <Details title={`Filas con errores (${formatCount(p.errorRows)})`}>
              <ul className="grid gap-1 text-sm">
                {p.errors.map((e) => (
                  <li key={e.rowNumber}>
                    <span className="font-mono text-xs text-[var(--z-muted)]">Fila {e.rowNumber}:</span> {e.message}
                  </li>
                ))}
              </ul>
            </Details>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={isPending || changesCount === 0}
              className="rounded-full bg-[var(--z-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--z-on-accent)] disabled:opacity-40"
            >
              {isPending
                ? "Importando…"
                : changesCount === 0
                  ? "No hay cambios para importar"
                  : `Importar ${formatCount(changesCount)} productos`}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-full px-4 py-2.5 text-sm text-[var(--z-muted)] hover:bg-[var(--z-soft)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--z-bg)] px-3 py-2.5">
      <div className={`text-xl font-semibold tabular-nums ${warn ? "text-amber-600 dark:text-amber-400" : ""}`}>
        {formatCount(value)}
      </div>
      <div className="text-xs text-[var(--z-muted)]">{label}</div>
    </div>
  );
}

function Details({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-xl border border-[var(--z-line)] px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">{title}</summary>
      <div className="mt-2 max-h-72 overflow-auto">{children}</div>
    </details>
  );
}

function Alert({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      : "border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300";
  return <p className={`mt-4 rounded-xl border px-3 py-2.5 text-sm ${cls}`}>{children}</p>;
}

import Link from "next/link";
import { ImportPanel } from "@/components/admin/ImportPanel";
import { formatCount, formatMoney } from "@/lib/format";
import { catalogStats, listAdminProducts } from "@/server/catalog/repository";

const PAGE_SIZE = 50;

export default async function CatalogPage({ searchParams }: PageProps<"/admin/catalogo">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const page = Math.max(1, Number(sp.page) || 1);

  const stats = catalogStats();
  const { total, items } = listAdminProducts({ q, page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const withoutPrice = stats.companies.reduce((s, c) => s + c.withoutPrice, 0);

  const pageHref = (n: number) => `/admin/catalogo?${new URLSearchParams({ ...(q && { q }), page: String(n) })}`;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Catálogo</h1>
        <p className="mt-1 text-sm text-[var(--z-muted)]">
          El costo y la empresa son privados: solo se ven aquí, nunca en el chat.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card label="Productos" value={formatCount(stats.totalProducts)} />
        <Card label="Empresas" value={formatCount(stats.companies.length)} hint={stats.companies.map((c) => c.name).join(", ")} />
        <Card label="Sin Precio Zeta" value={formatCount(withoutPrice)} />
        <Card
          label="Última importación"
          value={stats.lastImport ? stats.lastImport.createdAt.slice(0, 10) : "—"}
          hint={stats.lastImport?.fileName}
        />
      </div>

      <ImportPanel />

      <section className="grid gap-3">
        <form className="flex gap-2" action="/admin/catalogo">
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por descripción, código, marca… (ej. tps aveo)"
            className="min-w-0 flex-1 rounded-full border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-2 text-sm"
          />
          <button className="rounded-full bg-[var(--z-ink)] px-4 py-2 text-sm text-[var(--z-on-ink)]">Buscar</button>
        </form>
        <p className="text-sm text-[var(--z-muted)]">
          {formatCount(total)} productos{q && ` para “${q}”`}
        </p>

        <div className="overflow-x-auto rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)]">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-[var(--z-muted)]">
              <tr>
                <th className="px-3 py-2.5 font-medium">Empresa</th>
                <th className="px-3 py-2.5 font-medium">Código</th>
                <th className="px-3 py-2.5 font-medium">Descripción</th>
                <th className="px-3 py-2.5 font-medium">Cód. fabricante</th>
                <th className="px-3 py-2.5 font-medium">Marca</th>
                <th className="px-3 py-2.5 text-right font-medium">Costo</th>
                <th className="px-3 py-2.5 text-right font-medium">Precio Zeta</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-[var(--z-line)] align-top">
                  <td className="px-3 py-2">{p.company}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.internalCode}</td>
                  <td className="px-3 py-2">
                    {p.description}
                    {p.category && <div className="text-xs text-[var(--z-muted)]">{p.category}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.manufacturerCode ?? "—"}</td>
                  <td className="px-3 py-2">{p.partBrand ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--z-muted)]">{formatMoney(p.cost)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(p.price)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[var(--z-muted)]">
                    {stats.totalProducts === 0 ? "Todavía no hay productos. Importa un Excel arriba." : "Sin resultados."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between text-sm">
            {page > 1 ? <Link href={pageHref(page - 1)}>← Anterior</Link> : <span />}
            <span className="text-[var(--z-muted)]">
              Página {page} de {pages}
            </span>
            {page < pages ? <Link href={pageHref(page + 1)}>Siguiente →</Link> : <span />}
          </div>
        )}
      </section>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3">
      <div className="text-xs text-[var(--z-muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-[var(--z-muted)]">{hint}</div>}
    </div>
  );
}

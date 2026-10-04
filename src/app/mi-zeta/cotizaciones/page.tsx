import Link from "next/link";
import { LaborPriceForm, StatusSelect, WorkshopForm } from "@/components/quotes/QuoteSettings";
import { formatDate, formatMoney } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getWorkshopName, listLaborPrices, listQuotes, listTemplates } from "@/server/quotes/repository";
import { deleteLaborPriceAction, deleteTemplateAction } from "./actions";

export default async function QuotesPage() {
  const user = await requireUser("/mi-zeta/cotizaciones");
  const [quotes, labor, templates, workshopName] = await Promise.all([
    listQuotes(user.id),
    listLaborPrices(user.id),
    listTemplates(user.id),
    getWorkshopName(user.id),
  ]);

  return (
    <div className="grid gap-8">
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Cotizaciones</h1>
          <Link href="/" className="rounded-full bg-[var(--z-accent)] px-4 py-2 text-sm font-semibold text-[var(--z-on-accent)]">
            + Cotizar en el chat
          </Link>
        </div>
        {quotes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--z-line)] px-4 py-8 text-center text-sm text-[var(--z-muted)]">
            Todavía no tienes cotizaciones. En el chat escribe, por ejemplo: “Aveo 2010, cambio de kit de embrague”.
          </p>
        ) : (
          <ul className="grid gap-2">
            {quotes.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3">
                <Link href={`/mi-zeta/cotizaciones/${q.id}`} className="min-w-0 flex-1 hover:underline">
                  <span className="font-mono text-sm text-[var(--z-muted)]">#{q.number}</span>{" "}
                  <span className="font-medium">{q.clientName ?? "Sin cliente"}</span>
                  <span className="block truncate text-sm text-[var(--z-muted)]">
                    {q.vehicleLabel ?? "Sin vehículo"} · {formatDate(q.createdAt)}
                  </span>
                </Link>
                <span className="font-semibold tabular-nums">{formatMoney(q.total)}</span>
                <StatusSelect quoteId={q.id} status={q.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-semibold">Precios habituales de mano de obra</h2>
          <p className="text-sm text-[var(--z-muted)]">
            Zeta los sugiere al cotizar. También se guardan solos cuando guardas una cotización con mano de obra.
          </p>
        </div>
        <LaborPriceForm />
        {labor.length > 0 && (
          <ul className="divide-y divide-[var(--z-line)] rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)]">
            {labor.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">{l.name}</span>
                <span className="font-medium tabular-nums">{formatMoney(l.price)}</span>
                <form action={deleteLaborPriceAction.bind(null, l.id)}>
                  <button aria-label={`Eliminar ${l.name}`} className="text-[var(--z-muted)] hover:text-[var(--z-text)]">×</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-semibold">Plantillas de trabajos frecuentes</h2>
          <p className="text-sm text-[var(--z-muted)]">
            Créalas desde una cotización con “Guardar como plantilla”. Luego escribe en el chat, por ejemplo: “hazme el
            mantenimiento de 10 mil para este carro”.
          </p>
        </div>
        {templates.length === 0 ? (
          <p className="text-sm text-[var(--z-muted)]">Aún no tienes plantillas.</p>
        ) : (
          <ul className="divide-y divide-[var(--z-line)] rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)]">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{t.name}</span>
                  <span className="block truncate text-[var(--z-muted)]">{t.items.map((i) => i.description).join(", ")}</span>
                </span>
                <form action={deleteTemplateAction.bind(null, t.id)}>
                  <button aria-label={`Eliminar ${t.name}`} className="text-[var(--z-muted)] hover:text-[var(--z-text)]">×</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="font-semibold">Datos del taller</h2>
          <p className="text-sm text-[var(--z-muted)]">Aparece como firma en los mensajes de WhatsApp.</p>
        </div>
        <WorkshopForm name={workshopName} />
      </section>
    </div>
  );
}

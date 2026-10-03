"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveQuoteAction, saveTemplateAction, setQuoteStatusAction } from "@/app/mi-zeta/cotizaciones/actions";
import {
  KIND_LABELS,
  STATUS_LABELS,
  lineTotal,
  newItemKey,
  quoteTotals,
  vehicleText,
  whatsappLink,
  whatsappText,
  type QuoteDraft,
  type QuoteItem,
  type QuoteItemKind,
} from "@/core/quotes/types";
import { formatMoney } from "@/lib/format";

// Tarjeta de cotización editable. Vive dentro del chat y también en Mi Zeta.
export function QuoteCard({ initial, workshopName = null }: { initial: QuoteDraft; workshopName?: string | null }) {
  const [draft, setDraft] = useState<QuoteDraft>(initial);
  const [dirty, setDirty] = useState(initial.quoteId == null);
  const [workshop, setWorkshop] = useState(workshopName);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waText, setWaText] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const t = quoteTotals(draft);
  const clientName = draft.clientName ?? draft.newClient?.name ?? null;
  const clientPhone = draft.clientPhone ?? draft.newClient?.phone ?? null;

  function update(patch: Partial<QuoteDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setWaText(null);
    setNotice(null);
  }
  function updateItem(key: string, patch: Partial<QuoteItem>) {
    update({ items: draft.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) });
  }
  function addItem(kind: QuoteItemKind) {
    const description = kind === "mano_obra" ? `Mano de obra${draft.title ? ` – ${draft.title.toLowerCase()}` : ""}` : "";
    update({ items: [...draft.items, { key: newItemKey(), kind, description, quantity: 1, unitPrice: null, productId: null }] });
  }

  async function persist(): Promise<QuoteDraft | null> {
    const r = await saveQuoteAction(draft);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    const saved: QuoteDraft = {
      ...draft,
      quoteId: r.quoteId,
      number: r.number,
      status: draft.status ?? "borrador",
      clientId: r.clientId,
      vehicleId: r.vehicleId,
      clientName,
      clientPhone,
      newClient: null,
    };
    setDraft(saved);
    setDirty(false);
    setWorkshop(r.workshopName);
    return saved;
  }

  function save() {
    setError(null);
    start(async () => {
      const s = await persist();
      if (s) setNotice(`Cotización #${s.number} guardada.`);
    });
  }

  function prepareWhatsApp() {
    setError(null);
    start(async () => {
      const s = dirty || draft.quoteId == null ? await persist() : draft;
      if (s) setWaText(whatsappText(s, workshop));
    });
  }

  function markSent() {
    if (draft.quoteId == null || (draft.status && draft.status !== "borrador")) return;
    start(async () => {
      const r = await setQuoteStatusAction(draft.quoteId!, "enviada");
      if (r.ok) setDraft((d) => ({ ...d, status: "enviada" }));
    });
  }

  function saveTemplate() {
    if (!templateName) return;
    setError(null);
    start(async () => {
      const r = await saveTemplateAction(templateName, draft.items);
      if (!r.ok) return setError(r.error);
      setNotice(`Plantilla “${templateName}” guardada. La próxima vez escribe su nombre en el chat.`);
      setTemplateName(null);
    });
  }

  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)]">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--z-line)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--z-muted)]">
            Cotización{draft.number ? ` #${draft.number}` : ""}
          </p>
          <p className="font-semibold">{vehicleText(draft.vehicle) || draft.title || "Sin vehículo"}</p>
          <p className="text-sm text-[var(--z-muted)]">
            {clientName ?? "Sin cliente"}
            {clientPhone && ` · ${clientPhone}`}
          </p>
        </div>
        {draft.status && (
          <span className="rounded-full bg-[var(--z-soft)] px-2 py-0.5 text-xs font-medium">{STATUS_LABELS[draft.status]}</span>
        )}
      </header>

      <ul className="divide-y divide-[var(--z-line)]">
        {draft.items.map((i) => (
          <li key={i.key} className="grid gap-2 px-4 py-3">
            <div className="flex items-start gap-2">
              <select
                aria-label="Tipo"
                value={i.kind}
                onChange={(e) => updateItem(i.key, { kind: e.target.value as QuoteItemKind })}
                className="shrink-0 rounded-lg bg-[var(--z-soft)] px-1.5 py-1 text-xs"
              >
                {(Object.keys(KIND_LABELS) as QuoteItemKind[]).map((k) => (
                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                ))}
              </select>
              <input
                aria-label="Descripción"
                value={i.description}
                placeholder="Descripción"
                onChange={(e) => updateItem(i.key, { description: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--z-muted)]"
              />
              <button
                type="button"
                aria-label="Eliminar concepto"
                onClick={() => update({ items: draft.items.filter((x) => x.key !== i.key) })}
                className="grid size-6 shrink-0 place-items-center rounded-full text-[var(--z-muted)] hover:bg-[var(--z-soft)] hover:text-[var(--z-text)]"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-1 text-[var(--z-muted)]">
                Cant.
                <NumberInput
                  value={i.quantity}
                  onValue={(n) => updateItem(i.key, { quantity: n == null || n <= 0 ? 1 : n })}
                  className="w-14"
                />
              </label>
              <span className="text-[var(--z-muted)]">×</span>
              <label className="flex items-center gap-1 text-[var(--z-muted)]">
                $
                <NumberInput
                  value={i.unitPrice}
                  placeholder="precio"
                  onValue={(n) => updateItem(i.key, { unitPrice: n })}
                  className="w-24"
                />
              </label>
              <span className="ml-auto font-medium tabular-nums">
                {i.unitPrice == null ? <span className="text-xs text-amber-600 dark:text-amber-400">sin precio</span> : formatMoney(lineTotal(i))}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2 border-t border-[var(--z-line)] px-4 py-3">
        <SmallButton onClick={() => addItem("repuesto")}>+ Repuesto</SmallButton>
        <SmallButton onClick={() => addItem("mano_obra")}>+ Mano de obra</SmallButton>
        <SmallButton onClick={() => addItem("otro")}>+ Otro concepto</SmallButton>
      </div>

      <div className="grid gap-2 border-t border-[var(--z-line)] px-4 py-3 text-sm">
        <div className="flex items-center justify-between text-[var(--z-muted)]">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatMoney(t.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-[var(--z-muted)]">
          <label className="flex items-center gap-1">
            Descuento $
            <NumberInput value={draft.discount || null} placeholder="0" onValue={(n) => update({ discount: n ?? 0 })} className="w-20" />
          </label>
          <span className="tabular-nums">{t.discount > 0 ? `-${formatMoney(t.discount)}` : "—"}</span>
        </div>
        <div className="flex items-center justify-between pt-1 text-base font-semibold">
          <span>TOTAL</span>
          <span className="tabular-nums">{formatMoney(t.total)}</span>
        </div>
        {t.missingPrices > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t.missingPrices === 1 ? "1 concepto sin precio" : `${t.missingPrices} conceptos sin precio`}: escríbelo antes de enviar.
          </p>
        )}
        <textarea
          aria-label="Notas"
          value={draft.notes}
          rows={2}
          placeholder="Notas para el cliente (opcional)"
          onChange={(e) => update({ notes: e.target.value })}
          className="mt-1 w-full resize-none rounded-xl border border-[var(--z-line)] bg-[var(--z-bg)] px-3 py-2 text-[16px] outline-none focus:border-[var(--z-ink)] sm:text-sm"
        />
      </div>

      {(error || notice) && (
        <p className={`mx-4 mb-3 rounded-xl px-3 py-2 text-sm ${error ? "bg-red-500/10 text-red-800 dark:text-red-300" : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"}`}>
          {error ?? notice}
          {!error && draft.quoteId && (
            <> <Link href={`/mi-zeta/cotizaciones/${draft.quoteId}`} className="underline">Ver en Mi Zeta</Link></>
          )}
        </p>
      )}

      {templateName != null && (
        <div className="mx-4 mb-3 flex gap-2">
          <input
            autoFocus
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Nombre de la plantilla"
            className="min-w-0 flex-1 rounded-full border border-[var(--z-line)] bg-[var(--z-bg)] px-3 py-1.5 text-[16px] sm:text-sm"
          />
          <SmallButton onClick={saveTemplate}>Guardar plantilla</SmallButton>
          <SmallButton onClick={() => setTemplateName(null)}>Cancelar</SmallButton>
        </div>
      )}

      {waText && (
        <div className="mx-4 mb-3 grid gap-2 rounded-xl border border-[var(--z-line)] bg-[var(--z-bg)] p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--z-muted)]">Revisa el mensaje antes de enviarlo</p>
          <pre className="whitespace-pre-wrap font-sans text-sm">{waText}</pre>
          <a
            href={whatsappLink(clientPhone, waText)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={markSent}
            className="justify-self-start rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#0b2e17]"
          >
            Abrir WhatsApp{clientName ? ` de ${clientName.split(" ")[0]}` : ""}
          </a>
          {!clientPhone && <p className="text-xs text-[var(--z-muted)]">Sin teléfono: WhatsApp te pedirá elegir el contacto.</p>}
        </div>
      )}

      <footer className="flex flex-wrap gap-2 border-t border-[var(--z-line)] px-4 py-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || (!dirty && draft.quoteId != null)}
          className="rounded-full bg-[var(--z-ink)] px-4 py-2 text-sm font-medium text-[var(--z-on-ink)] disabled:opacity-40"
        >
          {pending ? "Guardando…" : draft.quoteId == null ? "Guardar" : dirty ? "Guardar cambios" : "Guardada"}
        </button>
        <button
          type="button"
          onClick={prepareWhatsApp}
          disabled={pending || draft.items.length === 0}
          className="rounded-full bg-[var(--z-accent)] px-4 py-2 text-sm font-semibold text-[var(--z-on-accent)] disabled:opacity-40"
        >
          Enviar por WhatsApp
        </button>
        <SmallButton onClick={() => setTemplateName(draft.title || "")}>Guardar como plantilla</SmallButton>
      </footer>
    </section>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[var(--z-line)] px-3 py-1.5 text-sm transition-colors hover:border-[var(--z-ink)] hover:bg-[var(--z-soft)]"
    >
      {children}
    </button>
  );
}

// Campo numérico que acepta "8,50" o "8.5" sin pelear con el cursor.
function NumberInput({
  value,
  onValue,
  placeholder,
  className = "",
}: {
  value: number | null;
  onValue: (n: number | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  return (
    <input
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, "");
        setText(raw);
        const n = Number(raw.replace(",", "."));
        onValue(raw === "" || !Number.isFinite(n) ? null : n);
      }}
      className={`rounded-lg border border-[var(--z-line)] bg-[var(--z-bg)] px-2 py-1 text-right text-[16px] tabular-nums text-[var(--z-text)] outline-none focus:border-[var(--z-ink)] sm:text-sm ${className}`}
    />
  );
}

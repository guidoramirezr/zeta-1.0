"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { saveLaborPriceAction, saveWorkshopNameAction, setQuoteStatusAction } from "@/app/mi-zeta/cotizaciones/actions";
import { ErrorText, inputClass } from "@/components/ui/form";
import { useFormSubmit } from "@/components/ui/useFormAction";
import { STATUS_LABELS, type QuoteStatus } from "@/core/quotes/types";

export function StatusSelect({ quoteId, status }: { quoteId: number; status: QuoteStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Estado"
      defaultValue={status}
      disabled={pending}
      onChange={(e) => start(async () => void (await setQuoteStatusAction(quoteId, e.target.value as QuoteStatus)))}
      className="rounded-full border border-[var(--z-line)] bg-[var(--z-bg)] px-2 py-1 text-xs"
    >
      {(Object.keys(STATUS_LABELS) as QuoteStatus[]).map((s) => (
        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
      ))}
    </select>
  );
}

export function LaborPriceForm() {
  const [state, action, pending] = useActionState(saveLaborPriceAction, null);
  const onSubmit = useFormSubmit(action);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="grid gap-2">
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_8rem_auto]">
        <input name="name" required placeholder="Trabajo (ej. Cambio de pastillas)" className={`${inputClass} col-span-2 sm:col-span-1`} />
        <input name="price" required inputMode="decimal" placeholder="Precio $" className={inputClass} />
        <button disabled={pending} className="rounded-full bg-[var(--z-ink)] px-4 text-sm text-[var(--z-on-ink)] disabled:opacity-50">
          Agregar
        </button>
      </div>
      {state && !state.ok && <ErrorText>{state.error}</ErrorText>}
    </form>
  );
}

export function WorkshopForm({ name }: { name: string | null }) {
  const [state, action, pending] = useActionState(saveWorkshopNameAction, null);
  const onSubmit = useFormSubmit(action);
  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input name="workshopName" defaultValue={name ?? ""} placeholder="Nombre del taller" className={`${inputClass} min-w-0 flex-1`} />
      <button disabled={pending} className="rounded-full bg-[var(--z-ink)] px-4 text-sm text-[var(--z-on-ink)] disabled:opacity-50">
        {state?.ok && !pending ? "Guardado" : "Guardar"}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addMaintenanceAction } from "@/app/mi-zeta/actions";
import { useFormSubmit } from "@/components/ui/useFormAction";
import { ErrorText, Field, PrimaryButton, inputClass } from "@/components/ui/form";
import { formatKm, todayIso } from "@/lib/format";

export function MaintenanceForm({ vehicleId }: { vehicleId: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addMaintenanceAction, null);
  const onSubmit = useFormSubmit(action);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar el formulario tras guardar
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--z-accent)] px-4 py-2 text-sm font-semibold text-[var(--z-on-accent)]">
        + Registrar mantenimiento
      </button>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] p-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input ref={confirmRef} type="hidden" name="confirmLowerMileage" value="0" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha *"><input name="date" type="date" className={inputClass} defaultValue={todayIso()} required /></Field>
        <Field label="Kilometraje"><input name="mileage" className={inputClass} inputMode="numeric" placeholder="182.450" /></Field>
      </div>
      <Field label="Trabajo realizado *"><input name="work" className={inputClass} placeholder="Cambio de aceite y filtro" required /></Field>
      <Field label="Repuestos utilizados"><input name="parts" className={inputClass} placeholder="Aceite 10W30, filtro…" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Próximo mantenimiento (km)"><input name="nextMileage" className={inputClass} inputMode="numeric" placeholder="187.000" /></Field>
        <Field label="Próximo mantenimiento (fecha)"><input name="nextDate" type="date" className={inputClass} /></Field>
      </div>
      <Field label="Notas"><input name="notes" className={inputClass} /></Field>

      {state?.error && <ErrorText>{state.error}</ErrorText>}
      {state?.lowerMileage && (
        <div className="grid gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
          <p>
            El último kilometraje registrado es <strong>{formatKm(state.lowerMileage.last)}</strong>. Estás ingresando{" "}
            <strong>{formatKm(state.lowerMileage.entered)}</strong>. ¿Quieres continuar?
          </p>
          <div>
            <button type="submit" onClick={() => { if (confirmRef.current) confirmRef.current.value = "1"; }}
              className="rounded-full border border-[var(--z-ink)] px-4 py-1.5 font-medium">
              Sí, guardar de todos modos
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <PrimaryButton type="submit" disabled={pending}
          onClick={() => { if (confirmRef.current) confirmRef.current.value = "0"; }}>
          {pending ? "Guardando…" : "Guardar"}
        </PrimaryButton>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm text-[var(--z-muted)] hover:bg-[var(--z-soft)]">
          Cancelar
        </button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { createVehicleAction } from "@/app/mi-zeta/actions";
import { useFormSubmit } from "@/components/ui/useFormAction";
import { ErrorText, Field, PrimaryButton, inputClass } from "@/components/ui/form";

export function VehicleForm({ clients }: { clients: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(createVehicleAction, null);
  const onSubmit = useFormSubmit(action);
  const [clientId, setClientId] = useState(clients.length ? "" : "new");

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <fieldset className="grid gap-3 rounded-2xl border border-[var(--z-line)] p-4">
        <legend className="px-1 text-sm font-medium">Cliente</legend>
        <Field label="Dueño del vehículo">
          <select name="clientId" className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Sin cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="new">+ Cliente nuevo</option>
          </select>
        </Field>
        {clientId === "new" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre"><input name="newClientName" className={inputClass} placeholder="Juan Pérez" required /></Field>
            <Field label="Teléfono"><input name="newClientPhone" className={inputClass} inputMode="tel" placeholder="099…" /></Field>
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-3 rounded-2xl border border-[var(--z-line)] p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-medium">Vehículo</legend>
        <Field label="Marca *"><input name="brand" className={inputClass} placeholder="Chevrolet" required /></Field>
        <Field label="Modelo *"><input name="model" className={inputClass} placeholder="Aveo" required /></Field>
        <Field label="Año"><input name="year" className={inputClass} inputMode="numeric" placeholder="2015" /></Field>
        <Field label="Placa"><input name="plate" className={inputClass} placeholder="PBX-1234" /></Field>
        <Field label="Motor"><input name="engine" className={inputClass} placeholder="1.5" /></Field>
        <Field label="Combustible">
          <select name="fuel" className={inputClass} defaultValue="">
            <option value="">—</option>
            <option>Gasolina</option>
            <option>Diésel</option>
            <option>Híbrido</option>
            <option>Eléctrico</option>
            <option>GLP</option>
          </select>
        </Field>
        <Field label="Kilometraje actual"><input name="mileage" className={inputClass} inputMode="numeric" placeholder="182.450" /></Field>
        <Field label="Notas"><input name="notes" className={inputClass} /></Field>
      </fieldset>

      {state?.error && <ErrorText>{state.error}</ErrorText>}
      <div><PrimaryButton type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar vehículo"}</PrimaryButton></div>
    </form>
  );
}

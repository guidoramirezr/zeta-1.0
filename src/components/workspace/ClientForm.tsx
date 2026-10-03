"use client";

import { useActionState, useEffect, useRef } from "react";
import { createClientAction } from "@/app/mi-zeta/actions";
import { useFormSubmit } from "@/components/ui/useFormAction";
import { ErrorText, Field, PrimaryButton, inputClass } from "@/components/ui/form";

export function ClientForm() {
  const [state, action, pending] = useActionState(createClientAction, null);
  const onSubmit = useFormSubmit(action);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] p-4 sm:grid-cols-2">
      <Field label="Nombre *"><input name="name" className={inputClass} placeholder="Juan Pérez" required /></Field>
      <Field label="Teléfono"><input name="phone" className={inputClass} inputMode="tel" placeholder="099…" /></Field>
      <Field label="Correo (opcional)"><input name="email" type="email" className={inputClass} /></Field>
      <Field label="Notas"><input name="notes" className={inputClass} /></Field>
      {state?.error && <div className="sm:col-span-2"><ErrorText>{state.error}</ErrorText></div>}
      <div className="sm:col-span-2"><PrimaryButton type="submit" disabled={pending}>{pending ? "Guardando…" : "Agregar cliente"}</PrimaryButton></div>
    </form>
  );
}

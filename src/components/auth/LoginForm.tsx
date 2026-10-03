"use client";

import { useState, useTransition } from "react";
import { requestCodeAction, verifyCodeAction } from "@/app/entrar/actions";
import { ErrorText, Field, PrimaryButton, inputClass } from "@/components/ui/form";

export function LoginForm({ next }: { next: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [localCode, setLocalCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function sendCode() {
    setError(null);
    start(async () => {
      const r = await requestCodeAction(email);
      if (!r.ok) return setError(r.error);
      setEmail(r.email);
      setLocalCode(r.localCode);
      setStep("code");
    });
  }

  function verify() {
    setError(null);
    start(async () => {
      const r = await verifyCodeAction({ email, code, name, next });
      if (r && !r.ok) setError(r.error);
    });
  }

  if (step === "email") {
    return (
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          sendCode();
        }}
      >
        <Field label="Correo">
          <input className={inputClass} type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoFocus />
        </Field>
        <Field label="Tu nombre (opcional)">
          <input className={inputClass} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Carlos" />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <PrimaryButton type="submit" disabled={pending}>{pending ? "Enviando…" : "Recibir código"}</PrimaryButton>
      </form>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
    >
      <p className="text-sm text-[var(--z-muted)]">
        Escribe el código de 6 dígitos para <strong className="text-[var(--z-text)]">{email}</strong>.
      </p>
      {localCode && (
        <p className="rounded-xl border border-dashed border-[var(--z-line)] bg-[var(--z-soft)] px-3 py-2.5 text-sm">
          <span className="text-[var(--z-muted)]">Modo local (sin correo todavía). Tu código es </span>
          <strong className="font-mono tracking-[0.2em]">{localCode}</strong>
        </p>
      )}
      <Field label="Código">
        <input className={`${inputClass} font-mono text-lg tracking-[0.4em]`} inputMode="numeric"
          autoComplete="one-time-code" maxLength={6} required value={code} autoFocus
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="••••••" />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <PrimaryButton type="submit" disabled={pending || code.length !== 6}>{pending ? "Verificando…" : "Entrar"}</PrimaryButton>
      <button type="button" onClick={() => { setStep("email"); setCode(""); setError(null); }}
        className="text-sm text-[var(--z-muted)] hover:text-[var(--z-text)]">
        Usar otro correo
      </button>
    </form>
  );
}

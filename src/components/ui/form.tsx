// Piezas de formulario compartidas (estilo Zeta).

export const inputClass =
  "w-full rounded-xl border border-[var(--z-line)] bg-[var(--z-surface)] px-3 py-2.5 text-[16px] outline-none focus:border-[var(--z-ink)] sm:text-sm";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-[var(--z-muted)]">{label}</span>
      {children}
      {hint && <span className="text-xs text-[var(--z-muted)]">{hint}</span>}
    </label>
  );
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-full bg-[var(--z-ink)] px-5 py-2.5 text-sm font-medium text-[var(--z-on-ink)] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-300">
      {children}
    </p>
  );
}

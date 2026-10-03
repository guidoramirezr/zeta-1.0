"use client";

import { useRef, useState } from "react";

type Props = {
  disabled?: boolean;
  onSend: (text: string) => void;
};

export function Composer({ disabled, onSend }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-end gap-2 rounded-[26px] border border-[var(--z-line)] bg-[var(--z-surface)] p-1.5 pl-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] focus-within:border-[var(--z-ink)]"
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder="Escribe tu consulta…"
        aria-label="Escribe tu consulta"
        onChange={(e) => {
          setValue(e.target.value);
          // Crece con el texto hasta un máximo.
          e.target.style.height = "auto";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          e.target.style.overflowY = e.target.scrollHeight > 160 ? "auto" : "hidden";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className="max-h-40 min-h-[40px] min-w-0 flex-1 resize-none overflow-y-hidden bg-transparent py-2 text-[16px] leading-6 outline-none placeholder:text-[var(--z-muted)]"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Enviar"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--z-accent)] text-[var(--z-on-accent)] transition-opacity disabled:opacity-30"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 19V5M5 12l7-7 7 7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </form>
  );
}

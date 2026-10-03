"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/core/chat/types";
import { getPlaceholderReply } from "@/core/chat/placeholder";
import { ZetaLogo } from "@/components/brand/ZetaLogo";
import { Composer } from "./Composer";
import { MessageBubble, TypingIndicator } from "./MessageBubble";

const SUGGESTIONS = [
  "¿Tienes repuestos para Aveo?",
  "¿Tienes sensor TPS para Kia Rio?",
  "¿Qué significa el código P0171?",
  "Mi auto tiembla al acelerar",
];

export function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function send(text: string) {
    if (pending) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setPending(true);
    try {
      const reply = await getPlaceholderReply(text);
      setMessages((m) => [...m, reply]);
    } finally {
      setPending(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-dvh flex-col bg-[var(--z-bg)] text-[var(--z-text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--z-line)] bg-[var(--z-bg)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <ZetaLogo />
          {!empty && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="rounded-full px-3 py-1.5 text-sm text-[var(--z-muted)] hover:bg-[var(--z-soft)] hover:text-[var(--z-text)]"
            >
              Nueva consulta
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto h-full max-w-3xl px-4">
          {empty ? (
            <section className="flex min-h-full flex-col justify-center py-8">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--z-muted)]">
                Inteligencia automotriz
              </p>
              <h1 className="mt-3 text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
                ¿Qué necesita
                <br />
                tu vehículo hoy?
              </h1>
              <p className="mt-3 max-w-md text-[15px] text-[var(--z-muted)]">
                Repuestos, compatibilidades, códigos OBD y diagnóstico. Pregunta
                como le preguntarías a un mecánico.
              </p>
              <div className="mt-8 grid gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3 text-left text-[15px] transition-colors hover:border-[var(--z-ink)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div className="flex flex-col gap-6 py-6">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onAction={send} />
              ))}
              {pending && <TypingIndicator />}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </main>

      <footer className="bg-[var(--z-bg)] pb-[max(env(safe-area-inset-bottom),12px)]">
        <div className="mx-auto max-w-3xl px-4 pt-2">
          <Composer disabled={pending} onSend={send} />
          <p className="mt-2 text-center text-[11px] text-[var(--z-muted)]">
            Zeta solo informa productos que existen en los catálogos conectados.
          </p>
        </div>
      </footer>
    </div>
  );
}

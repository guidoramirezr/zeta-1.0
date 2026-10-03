import type { ChatMessage } from "@/core/chat/types";
import { ZetaLogo } from "@/components/brand/ZetaLogo";

type Props = {
  message: ChatMessage;
  onAction: (prompt: string) => void;
};

export function MessageBubble({ message, onAction }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-[var(--z-ink)] px-4 py-2.5 text-[15px] leading-relaxed text-[var(--z-on-ink)]">
          {message.text}
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="pt-0.5">
        <ZetaLogo size={26} withWordmark={false} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
          {message.text}
        </p>
        {message.actions && message.actions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => onAction(a.prompt)}
                className="rounded-full border border-[var(--z-line)] px-3.5 py-1.5 text-sm transition-colors hover:border-[var(--z-ink)] hover:bg-[var(--z-soft)]"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex gap-3" aria-live="polite" aria-label="Zeta está escribiendo">
      <div className="pt-0.5">
        <ZetaLogo size={26} withWordmark={false} />
      </div>
      <div className="flex items-center gap-1 pt-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="z-dot size-1.5 rounded-full bg-[var(--z-muted)]"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

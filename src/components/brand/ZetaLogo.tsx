type Props = { size?: number; withWordmark?: boolean };

// Marca Zeta: una "Z" trazada como una ruta, dentro de un cuadro redondeado.
export function ZetaLogo({ size = 28, withWordmark = true }: Props) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="9" fill="var(--z-ink)" />
        <path
          d="M9.5 10h13L9.5 22h13"
          fill="none"
          stroke="var(--z-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && (
        <span className="text-[17px] font-semibold tracking-[-0.02em]">
          Zeta
        </span>
      )}
    </span>
  );
}

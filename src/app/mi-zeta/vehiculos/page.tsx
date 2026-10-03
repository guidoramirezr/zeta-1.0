import Link from "next/link";
import { formatDate, formatKm } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { listVehicles } from "@/server/workspace/repository";

export default async function VehiclesPage() {
  const user = await requireUser("/mi-zeta/vehiculos");
  const vehicles = listVehicles(user.id);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Vehículos</h1>
        <Link href="/mi-zeta/vehiculos/nuevo" className="rounded-full bg-[var(--z-accent)] px-4 py-2 text-sm font-semibold text-[var(--z-on-accent)]">
          + Agregar
        </Link>
      </div>
      {vehicles.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--z-line)] px-4 py-8 text-center text-sm text-[var(--z-muted)]">
          Todavía no tienes vehículos registrados.
        </p>
      ) : (
        <ul className="grid gap-2">
          {vehicles.map((v) => (
            <li key={v.id}>
              <Link href={`/mi-zeta/vehiculos/${v.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] px-4 py-3 hover:border-[var(--z-ink)]">
                <span>
                  <span className="font-medium">{[v.brand, v.model, v.year].filter(Boolean).join(" ")}</span>
                  {v.plate && <span className="ml-2 rounded-md bg-[var(--z-soft)] px-1.5 py-0.5 font-mono text-xs">{v.plate}</span>}
                  <span className="block text-sm text-[var(--z-muted)]">{v.clientName ?? "Sin cliente"}</span>
                </span>
                <span className="text-right text-sm">
                  <span className="block tabular-nums">{formatKm(v.mileage)}</span>
                  <span className="text-xs text-[var(--z-muted)]">
                    {v.lastServiceDate ? `Último servicio ${formatDate(v.lastServiceDate)}` : "Sin servicios"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

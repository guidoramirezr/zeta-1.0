import Link from "next/link";
import { notFound } from "next/navigation";
import { MaintenanceForm } from "@/components/workspace/MaintenanceForm";
import { formatDate, formatKm } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { getVehicle, listMaintenances } from "@/server/workspace/repository";

export default async function VehiclePage({ params }: PageProps<"/mi-zeta/vehiculos/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/mi-zeta/vehiculos/${id}`);
  const vehicle = await getVehicle(user.id, Number(id));
  if (!vehicle) notFound();
  const history = await listMaintenances(user.id, vehicle.id);
  const specs = [vehicle.engine, vehicle.fuel].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <Link href="/mi-zeta/vehiculos" className="text-sm text-[var(--z-muted)] hover:text-[var(--z-text)]">← Vehículos</Link>

      <section className="rounded-2xl border border-[var(--z-line)] bg-[var(--z-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              {[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ")}
            </h1>
            {specs && <p className="text-sm text-[var(--z-muted)]">{specs}</p>}
          </div>
          {vehicle.plate && <span className="rounded-lg bg-[var(--z-soft)] px-2 py-1 font-mono text-sm">{vehicle.plate}</span>}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[var(--z-muted)]">Kilometraje actual</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatKm(vehicle.mileage)}</dd>
          </div>
          <div>
            <dt className="text-[var(--z-muted)]">Cliente</dt>
            <dd className="font-medium">{vehicle.clientName ?? "Sin cliente"}</dd>
            {vehicle.clientPhone && <dd className="text-[var(--z-muted)]">{vehicle.clientPhone}</dd>}
          </div>
        </dl>
        {vehicle.notes && <p className="mt-3 text-sm text-[var(--z-muted)]">{vehicle.notes}</p>}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Historial de mantenimiento</h2>
        </div>
        <MaintenanceForm vehicleId={vehicle.id} />

        {history.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--z-line)] px-4 py-8 text-center text-sm text-[var(--z-muted)]">
            Todavía no hay mantenimientos registrados para este vehículo.
          </p>
        ) : (
          <ol className="relative grid gap-4 border-l border-[var(--z-line)] pl-5">
            {history.map((m) => (
              <li key={m.id} className="relative">
                <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-[var(--z-ink)]" />
                <p className="text-sm text-[var(--z-muted)]">
                  {formatDate(m.date)}{m.mileage != null && ` · ${formatKm(m.mileage)}`}
                </p>
                <p className="font-medium">{m.work}</p>
                {m.parts && <p className="text-sm">Repuestos: {m.parts}</p>}
                {(m.nextMileage != null || m.nextDate) && (
                  <p className="text-sm text-[var(--z-muted)]">
                    Próximo: {[m.nextMileage != null && formatKm(m.nextMileage), m.nextDate && formatDate(m.nextDate)].filter(Boolean).join(" o ")}
                  </p>
                )}
                {m.notes && <p className="text-sm text-[var(--z-muted)]">{m.notes}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

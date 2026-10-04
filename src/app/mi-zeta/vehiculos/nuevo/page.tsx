import Link from "next/link";
import { VehicleForm } from "@/components/workspace/VehicleForm";
import { requireUser } from "@/server/auth/session";
import { listClients } from "@/server/workspace/repository";

export default async function NewVehiclePage() {
  const user = await requireUser("/mi-zeta/vehiculos/nuevo");
  const clients = (await listClients(user.id)).map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <Link href="/mi-zeta/vehiculos" className="text-sm text-[var(--z-muted)] hover:text-[var(--z-text)]">← Vehículos</Link>
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Nuevo vehículo</h1>
      <VehicleForm clients={clients} />
    </div>
  );
}

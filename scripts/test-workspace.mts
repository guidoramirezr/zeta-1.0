// Prueba de login y privacidad de "Mi Zeta" con datos FICTICIOS en base temporal.
// Uso: npm run test:workspace
import assert from "node:assert/strict";
import { setupTestDatabase } from "./test-db.mjs";

const cleanup = await setupTestDatabase();
const otp = await import("../src/server/auth/otp");
const ws = await import("../src/server/workspace/repository");

const ok = (m: string) => console.log("  ✓", m);
try {
  // Login por código
  const { localCode } = await otp.requestLoginCode("Carlos@Taller.ec");
  await assert.rejects(async () => await otp.verifyLoginCode("carlos@taller.ec", "000000".replace(/./g, (c, i) => (localCode![i] === "0" ? "1" : "0"))), /incorrecto/);
  const carlos = await otp.verifyLoginCode("carlos@taller.ec", localCode!, "Carlos");
  await assert.rejects(async () => await otp.verifyLoginCode("carlos@taller.ec", localCode!), /venció|no es válido/);
  ok("login con código: incorrecto rechazado, correcto acepta, no se reutiliza");
  const ana = await otp.verifyLoginCode("ana@otro.ec", (await otp.requestLoginCode("ana@otro.ec")).localCode!);
  assert.notEqual(carlos, ana);

  // Datos de Carlos
  const aveo = await ws.createVehicle(carlos, { newClientName: "Juan Pérez", newClientPhone: "0999", plate: "pbx-1234",
    brand: "Chevrolet", model: "Aveo", year: 2015, engine: "1.5", mileage: 178200 });
  await ws.addMaintenance(carlos, { vehicleId: aveo, date: "2026-06-12", mileage: 178200, work: "Mantenimiento de frenos" }, { confirmLowerMileage: false });
  await ws.addMaintenance(carlos, { vehicleId: aveo, date: "2026-10-03", mileage: 182450, work: "Cambio de aceite y filtro", nextMileage: 187000 }, { confirmLowerMileage: false });
  assert.equal((await ws.getVehicle(carlos, aveo))!.mileage, 182450);
  assert.equal((await ws.getVehicle(carlos, aveo))!.plate, "PBX-1234");
  ok("mantenimiento actualiza el kilometraje (178.200 → 182.450)");

  const low = await ws.addMaintenance(carlos, { vehicleId: aveo, date: "2026-10-04", mileage: 180000, work: "Revisión" }, { confirmLowerMileage: false });
  assert.deepEqual(low, { ok: false, lowerMileage: { last: 182450, entered: 180000 } });
  await ws.addMaintenance(carlos, { vehicleId: aveo, date: "2026-10-04", mileage: 180000, work: "Revisión" }, { confirmLowerMileage: true });
  assert.equal((await ws.getVehicle(carlos, aveo))!.mileage, 182450);
  ok("km menor pide confirmación y, confirmado, no baja el kilometraje actual");

  assert.equal((await ws.listMaintenances(carlos, aveo)).length, 3);
  assert.equal((await ws.listUpcoming(carlos))[0]?.nextMileage, 187000);
  ok("una revisión sin 'próximo' no borra el recordatorio de 187.000 km");
  const s = await ws.workspaceSummary(carlos);
  assert.deepEqual([s.vehicles, s.clients, s.maintenances], [1, 1, 3]);
  ok("historial y resumen de inicio");

  // Privacidad: Ana no ve nada de Carlos
  assert.equal(await ws.getVehicle(ana, aveo), null);
  assert.equal((await ws.listVehicles(ana)).length, 0);
  assert.equal((await ws.listClients(ana)).length, 0);
  assert.equal((await ws.listMaintenances(ana, aveo)).length, 0);
  await assert.rejects(async () => await ws.addMaintenance(ana, { vehicleId: aveo, date: "2026-10-03", work: "x" }, { confirmLowerMileage: true }), /no encontrado/);
  const juanId = (await ws.listClients(carlos))[0].id;
  await assert.rejects(async () => await ws.createVehicle(ana, { clientId: juanId, brand: "Kia", model: "Rio" }), /no encontrado/);
  assert.equal((await ws.workspaceSummary(ana)).vehicles, 0);
  ok("privacidad: otra cuenta no puede ver ni modificar clientes, vehículos ni historial");
  console.log("\nTodo OK");
} finally {
  await cleanup();
}

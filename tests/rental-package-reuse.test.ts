import assert from "node:assert/strict";
import test from "node:test";
import type * as Appointments from "../app/(protected)/dashboard/citas/actions";
import * as psychology from "../lib/psychology";
import * as billingSummary from "../lib/citas/billing-summary";
import * as appointmentFilters from "../lib/citas/filters";
import { resolveSerializedAppliedValue } from "../lib/citas/applied-value";
import { loadServerModule } from "./load-server-module";

type Package = {
  id: bigint; tenantId: number; catalogoId: bigint; usuarioId: number | null;
  clienteId: number | null; estado: string; saldoRestante: number;
  sesionesTotales: number; sesionesConsumidas: number; precioPagado: number;
};
type Appointment = {
  id: bigint; tenantId: number; empresaId: number; psicologoId: number;
  pacienteId: number | null; consultorioId: bigint; paqueteId: bigint;
  horaInicio: Date; horaFin: Date; valor: number; realizada: boolean | null;
  estadoPago: string; metodoPago: string | null;
};

function fixture(rental = true) {
  const oldPackage: Package = {
    id: 2072n, tenantId: 4, catalogoId: 1n, usuarioId: rental ? 25 : null,
    clienteId: rental ? null : 40, estado: "ACTIVO", saldoRestante: rental ? 0 : 2,
    sesionesTotales: rental ? 1 : 3, sesionesConsumidas: 1,
    precioPagado: rental ? 56700 : 540000,
  };
  const oldAppointment: Appointment = {
    id: 2707n, tenantId: 4, empresaId: 3, psicologoId: 25,
    pacienteId: oldPackage.clienteId, consultorioId: 12n, paqueteId: oldPackage.id,
    horaInicio: new Date("2026-10-09T20:00:00Z"), horaFin: new Date("2026-10-09T23:00:00Z"),
    valor: oldPackage.precioPagado, realizada: false, estadoPago: "PENDIENTE", metodoPago: null,
  };
  const packages = new Map<bigint, Package>([[oldPackage.id, oldPackage]]);
  const appointments = new Map<bigint, Appointment>([[oldAppointment.id, oldAppointment]]);
  const paidPackages = new Set<bigint>();
  const state = { occupied: false, active: true, packageCreates: 0, reuseQueries: 0, audits: 0,
    appointmentWrites: 0, packageWrites: 0, referenceQueries: [] as unknown[], paymentQueries: [] as bigint[] };
  const tx = {
    $queryRaw: async () => [],
    usuario: { findFirst: async () => ({ id: 25 }) },
    cliente: { findFirst: async () => ({ id: 40 }) },
    empresa: { findFirst: async () => ({ id: 3 }) },
    consultorios: { findFirst: async () => ({ id: 12n }) },
    servicio: { findFirst: async () => ({ id: 8, nombre: "Alquiler legado" }) },
    terapiasPsicologos: { findFirst: async (q: { where: { id?: bigint; tenantId: number; activo?: boolean } }) => {
      assert.equal(q.where.tenantId, 4);
      return q.where.activo && !state.active ? null : { id: 1n, activo: state.active,
        nombre: rental && q.where.id !== 2n ? "Alquiler consultorio" : "Terapia individual", cantidadSesiones: rental ? 1 : 3, precioBase: rental ? 18900 : 540000 };
    } },
    citasPsicologos: {
      findFirst: async (q: { where: { id?: bigint; tenantId: number } }) => {
        assert.equal(q.where.tenantId, 4);
        if (typeof q.where.id === "bigint") {
          const appointment = appointments.get(q.where.id);
          return appointment ? { ...appointment, PaqueteAdquirido: packages.get(appointment.paqueteId) } : null;
        }
        return state.occupied ? { id: 999n } : null;
      },
      findUnique: async (q: { where: { id: bigint; tenantId: number } }) => {
        assert.equal(q.where.tenantId, 4);
        const appointment = appointments.get(q.where.id);
        return appointment ? { ...appointment, PaqueteAdquirido: packages.get(appointment.paqueteId) } : null;
      },
      count: async (q: { where: { paqueteId: bigint; tenantId?: number } }) => {
        state.referenceQueries.push(q.where);
        return [...appointments.values()].filter((appointment) => appointment.paqueteId === q.where.paqueteId &&
          (q.where.tenantId === undefined || appointment.tenantId === q.where.tenantId)).length;
      },
      update: async (q: { where: { id: bigint; tenantId: number }; data: Partial<Appointment> }) => {
        assert.equal(q.where.tenantId, 4);
        state.appointmentWrites++;
        const appointment = appointments.get(q.where.id)!;
        Object.assign(appointment, q.data); return appointment;
      },
      updateMany: async (q: { where: { id: bigint }; data: Partial<Appointment> }) => {
        const appointment = appointments.get(q.where.id);
        if (!appointment) return { count: 0 };
        state.appointmentWrites++;
        Object.assign(appointment, q.data); return { count: 1 };
      },
      create: async (q: { data: Omit<Appointment, "id" | "realizada" | "estadoPago"> & { estadoPago?: string } }) => {
        const appointment = { id: 2708n, realizada: false, estadoPago: "PENDIENTE", ...q.data };
        appointments.set(appointment.id, appointment); return appointment;
      },
    },
    paqueteAdquirido: {
      findFirst: async (q: { where: { id?: bigint; tenantId: number; clienteId?: number | null; usuarioId?: number } }) => {
        assert.equal(q.where.tenantId, 4);
        if (q.where.id !== undefined) return packages.get(q.where.id)?.tenantId === 4 ? packages.get(q.where.id) : null;
        state.reuseQueries++;
        assert.equal(q.where.clienteId, oldPackage.clienteId);
        return oldPackage.saldoRestante > 0 ? oldPackage : null;
      },
      updateMany: async (q: { where: { id: bigint }; data: { saldoRestante: { increment?: number; decrement?: number }; sesionesConsumidas: { increment?: number; decrement?: number } } }) => {
        const pkg = packages.get(q.where.id);
        if (!pkg) return { count: 0 };
        state.packageWrites++;
        pkg.saldoRestante += (q.data.saldoRestante.increment ?? 0) - (q.data.saldoRestante.decrement ?? 0);
        pkg.sesionesConsumidas += (q.data.sesionesConsumidas.increment ?? 0) - (q.data.sesionesConsumidas.decrement ?? 0);
        return { count: 1 };
      },
      create: async (q: { data: Omit<Package, "id"> }) => {
        state.packageCreates++;
        const pkg = { id: 3000n, ...q.data }; packages.set(pkg.id, pkg); return pkg;
      },
    },
  };
  const api = loadServerModule<typeof Appointments>("app/(protected)/dashboard/citas/actions.ts", {
    "@/lib/psychology": psychology, "@/lib/citas/billing-summary": billingSummary, "@/lib/citas/filters": appointmentFilters,
    "@/lib/prisma": { ...tx, $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) },
    "@/lib/auth": { verifyToken: async (token: string) => token === "valid" ? { userId: 10 } : null },
    "next/cache": { revalidatePath() {} },
    "@/prisma/generated/prisma/client": { Prisma: { Decimal: { isDecimal: () => false } }, Rol: {}, EstadoPagoOrden: {} },
    "date-fns-tz": { fromZonedTime: (s: string) => new Date(`${s}-05:00`) }, "@supabase/supabase-js": {},
    "@/lib/audit": { createAuditLog: async () => { state.audits++; } },
    "@/lib/psychology-access": { requireFinanceUser: async () => ({ id: 10, tenantId: 4 }) },
    "@/lib/package-payment": { getPackagePaymentState: async (_tx: unknown, tenant: number, packageId: bigint) => {
      assert.equal(tenant, 4); state.paymentQueries.push(packageId);
      return paidPackages.has(packageId) ? { estadoPago: "CONCILIADO", metodoPago: "TRANSFERENCIA" } : null;
    } },
    "@/lib/psychology-appointment-delete": {},
  });
  const form = () => {
    const f = new FormData();
    for (const [key, value] of Object.entries({ empresa: "3", tecnico: "25", terapiaId: "1", fechaVisita: "2026-10-10",
      horaInicio: "15:00", horaFin: "16:00", consultorio: "12", valorCotizado: rental ? "18900" : "540000", metodoPago: "TRANSFERENCIA" })) f.set(key, value);
    if (!rental) f.set("cliente", "40");
    return f;
  };
  return { api, form, oldPackage, oldAppointment, packages, appointments, paidPackages, state };
}

test("cancelled three-hour rental cannot lend its package price to a new one-hour reservation", async () => {
  const f = fixture();
  assert.ok((await f.api.markCitaAsCancelada("valid", 2707)).success);
  assert.equal(f.oldPackage.saldoRestante, 1);
  assert.ok((await f.api.createCita("valid", f.form())).success);
  const appointment = f.appointments.get(2708n)!;
  const pkg = f.packages.get(appointment.paqueteId)!;
  assert.equal((appointment.horaFin.getTime() - appointment.horaInicio.getTime()) / 60000, 60);
  assert.equal(appointment.valor, 18900);
  assert.equal(pkg.precioPagado, 18900);
  assert.equal(pkg.sesionesTotales, 1);
  assert.notEqual(pkg.id, f.oldPackage.id);
  assert.equal(resolveSerializedAppliedValue({ valorAplicado: null, packageSnapshot: { totalPrice: pkg.precioPagado, sessions: pkg.sesionesTotales }, legacyValue: appointment.valor }), "18900.00");
  assert.equal(f.oldAppointment.paqueteId, f.oldPackage.id);
  assert.equal(f.oldAppointment.realizada, null);
  assert.equal(f.oldPackage.precioPagado, 56700);
  assert.equal(f.oldPackage.saldoRestante, 1);
  assert.equal(f.state.reuseQueries, 0);
});

test("a paid historical rental stays untouched and cannot mark the new reservation paid", async () => {
  const f = fixture(); f.paidPackages.add(f.oldPackage.id);
  await f.api.markCitaAsCancelada("valid", 2707);
  assert.ok((await f.api.createCita("valid", f.form())).success);
  assert.deepEqual(f.state.paymentQueries, [3000n]);
  assert.equal(f.appointments.get(2708n)!.estadoPago, "PENDIENTE");
  assert.equal(f.oldPackage.precioPagado, 56700);
  assert.ok(f.paidPackages.has(f.oldPackage.id));
});

test("an explicit previous rental package cannot bypass the new-package rule", async () => {
  for (const includeTherapy of [false, true]) {
    const f = fixture(); f.oldPackage.saldoRestante = 1; f.paidPackages.add(f.oldPackage.id);
    const form = f.form(); form.set("paqueteId", f.oldPackage.id.toString());
    if (!includeTherapy) form.delete("terapiaId");
    assert.match((await f.api.createCita("valid", form)).error || "", /propio paquete/);
    assert.equal(f.oldPackage.saldoRestante, 1);
    assert.equal(f.oldPackage.precioPagado, 56700);
    assert.equal(f.appointments.size, 1);
    assert.equal(f.state.paymentQueries.length, 0);
  }
});

test("new rental still rejects unauthorized, inactive, occupied and legacy inputs before writing", async () => {
  for (const kind of ["unauthorized", "inactive", "occupied", "legacy"] as const) {
    const f = fixture(); const form = f.form();
    if (kind === "inactive") f.state.active = false;
    if (kind === "occupied") f.state.occupied = true;
    if (kind === "legacy") { form.delete("terapiaId"); form.set("servicio", "8"); }
    assert.ok((await f.api.createCita(kind === "unauthorized" ? "invalid" : "valid", form)).error);
    assert.equal(f.state.packageCreates, 0);
    assert.equal(f.appointments.size, 1);
    assert.equal(f.oldPackage.precioPagado, 56700);
  }
});

test("normal multi-session therapy continues to reuse the existing patient package", async () => {
  const f = fixture(false);
  assert.ok((await f.api.createCita("valid", f.form())).success);
  assert.equal(f.appointments.get(2708n)!.paqueteId, f.oldPackage.id);
  assert.equal(f.state.packageCreates, 0);
  assert.equal(f.state.reuseQueries, 1);
  assert.equal(f.oldPackage.precioPagado, 540000);
  assert.equal(f.oldPackage.saldoRestante, 1);
  assert.equal(f.oldPackage.sesionesConsumidas, 2);
});

test("explicit normal therapy package retains its patient, price and payment relationship", async () => {
  const f = fixture(false); f.paidPackages.add(f.oldPackage.id);
  const form = f.form(); form.delete("terapiaId"); form.set("paqueteId", f.oldPackage.id.toString()); form.set("valorCotizado", "0");
  assert.ok((await f.api.createCita("valid", form)).success);
  assert.equal(f.appointments.get(2708n)!.paqueteId, f.oldPackage.id);
  assert.equal(f.appointments.get(2708n)!.estadoPago, "CONCILIADO");
  assert.deepEqual(f.state.paymentQueries, [f.oldPackage.id]);
  assert.equal(f.state.packageCreates, 0);
  assert.equal(f.oldPackage.precioPagado, 540000);
});

test("metadata-only edits of active or cancelled shared rentals cannot propagate another reservation's payment", async () => {
  for (const cancelled of [false, true]) {
    const f = fixture(); f.oldAppointment.realizada = null; f.paidPackages.add(f.oldPackage.id);
    const appointment: Appointment = { ...f.oldAppointment, id: 2708n, realizada: cancelled ? null : false,
      horaInicio: new Date("2026-10-10T20:00:00Z"), horaFin: new Date("2026-10-10T21:00:00Z"), valor: 18900 };
    f.appointments.set(appointment.id, appointment);
    const form = f.form(); form.delete("terapiaId"); form.set("consultorioId", "12"); form.set("observacion", "Solo cambia la observación");
    const before = structuredClone(appointment);
    assert.match((await f.api.updateCita("valid", 2708, form)).error || "", /varias reservas, incluidas las canceladas/);
    assert.deepEqual(appointment, before);
    assert.deepEqual(structuredClone(f.state.referenceQueries), [{ paqueteId: f.oldPackage.id }]);
    assert.equal(f.state.appointmentWrites, 0);
    assert.equal(f.state.packageCreates, 0);
    assert.equal(f.state.paymentQueries.length, 0);
    assert.equal(f.state.audits, 0);
    assert.equal(f.oldPackage.precioPagado, 56700);
  }
});

test("switching service cannot bypass the shared historical rental guard", async () => {
  const f = fixture();
  f.appointments.set(2708n, { ...f.oldAppointment, id: 2708n });
  const form = f.form(); form.set("terapiaId", "2"); form.set("consultorioId", "12");
  assert.match((await f.api.updateCita("valid", 2708, form)).error || "", /varias reservas/);
  assert.equal(f.state.appointmentWrites, 0);
  assert.equal(f.state.paymentQueries.length, 0);
  assert.equal(f.state.packageCreates, 0);
});

test("metadata edit of a single rental retains its own historical price and payment relationship", async () => {
  const f = fixture(); f.paidPackages.add(f.oldPackage.id);
  const form = f.form(); form.set("fechaVisita", "2026-10-09"); form.set("horaFin", "18:00"); form.set("consultorioId", "12");
  assert.ok((await f.api.updateCita("valid", 2707, form)).success);
  assert.equal(f.state.appointmentWrites, 1);
  assert.equal(f.oldAppointment.valor, 56700);
  assert.equal(f.oldAppointment.estadoPago, "CONCILIADO");
  assert.deepEqual(f.state.paymentQueries, [f.oldPackage.id]);
  assert.equal(f.oldPackage.precioPagado, 56700);
});

test("foreign references also prevent treating a rental package as exclusive during edit or restoration", async () => {
  for (const restore of [false, true]) {
    const f = fixture(); f.oldAppointment.realizada = restore ? null : false;
    f.appointments.set(2708n, { ...f.oldAppointment, id: 2708n, tenantId: 9, realizada: null });
    const form = f.form(); form.set("fechaVisita", "2026-10-09"); form.set("horaFin", "18:00"); form.set("consultorioId", "12");
    const result = restore ? await f.api.restoreCitaCancelada("valid", 2707) : await f.api.updateCita("valid", 2707, form);
    assert.match(result.error || "", /varias reservas/);
    assert.deepEqual(structuredClone(f.state.referenceQueries), [{ paqueteId: f.oldPackage.id }]);
    assert.equal(f.state.appointmentWrites, 0);
    assert.equal(f.state.packageWrites, 0);
    assert.equal(f.state.paymentQueries.length, 0);
    assert.equal(f.state.audits, 0);
  }
});

test("restoring a shared cancelled rental cannot consume balance or propagate an old payment", async () => {
  for (const paid of [false, true]) {
    const f = fixture(); f.oldAppointment.realizada = null;
    f.oldPackage.saldoRestante = 1; f.oldPackage.sesionesConsumidas = 0;
    const appointment = { ...f.oldAppointment, id: 2708n, horaInicio: new Date("2026-10-10T20:00:00Z"),
      horaFin: new Date("2026-10-10T21:00:00Z"), valor: 18900 };
    f.appointments.set(appointment.id, appointment);
    if (paid) f.paidPackages.add(f.oldPackage.id);
    assert.match((await f.api.restoreCitaCancelada("valid", 2708)).error || "", /varias reservas, incluidas las canceladas/);
    assert.equal(appointment.realizada, null);
    assert.equal(appointment.estadoPago, "PENDIENTE");
    assert.equal(appointment.valor, 18900);
    assert.equal(f.oldPackage.precioPagado, 56700);
    assert.equal(f.oldPackage.saldoRestante, 1);
    assert.equal(f.oldPackage.sesionesConsumidas, 0);
    assert.equal(f.state.appointmentWrites, 0);
    assert.equal(f.state.packageWrites, 0);
    assert.equal(f.state.paymentQueries.length, 0);
    assert.equal(f.state.audits, 0);
  }
});

test("single rental and normal therapy restoration preserve payments and conflict checks", async () => {
  for (const rental of [false, true]) {
    for (const occupied of [false, true]) {
      const f = fixture(rental); f.oldAppointment.realizada = null;
      f.oldPackage.saldoRestante = 1; f.oldPackage.sesionesConsumidas = 0;
      f.state.occupied = occupied; f.paidPackages.add(f.oldPackage.id);
      if (!rental) f.appointments.set(2708n, { ...f.oldAppointment, id: 2708n });
      const result = await f.api.restoreCitaCancelada("valid", 2707);
      if (occupied) {
        assert.match(result.error || "", /ya tiene una reserva/);
        assert.equal(f.state.appointmentWrites, 0);
        assert.equal(f.state.packageWrites, 0);
        assert.equal(f.state.paymentQueries.length, 0);
      } else {
        assert.ok("success" in result && result.success);
        assert.equal(f.oldAppointment.realizada, false);
        assert.equal(f.oldAppointment.estadoPago, "CONCILIADO");
        assert.equal(f.oldPackage.saldoRestante, 0);
        assert.equal(f.oldPackage.sesionesConsumidas, 1);
        assert.deepEqual(f.state.paymentQueries, [f.oldPackage.id]);
      }
    }
  }
});

test("cancelled package with remaining balance cannot restore a reservation or propagate payment", async () => {
  const f = fixture(); f.oldAppointment.realizada = null;
  f.oldPackage.estado = "CANCELADO"; f.oldPackage.saldoRestante = 1; f.oldPackage.sesionesConsumidas = 0;
  f.paidPackages.add(f.oldPackage.id);
  const before = structuredClone(f.oldAppointment);
  assert.match((await f.api.restoreCitaCancelada("valid", 2707)).error || "", /paquete de esta reserva está cancelado/);
  assert.deepEqual(f.oldAppointment, before);
  assert.equal(f.oldPackage.estado, "CANCELADO");
  assert.equal(f.oldPackage.saldoRestante, 1);
  assert.equal(f.oldPackage.sesionesConsumidas, 0);
  assert.equal(f.oldPackage.precioPagado, 56700);
  assert.equal(f.state.appointmentWrites, 0);
  assert.equal(f.state.packageWrites, 0);
  assert.equal(f.state.paymentQueries.length, 0);
  assert.equal(f.state.audits, 0);
});

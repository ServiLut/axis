"use server";

import prisma from "@/lib/prisma";
import type { Prisma } from "@/prisma/generated/prisma/client";
import { requireReceptionUser } from "@/lib/psychology-access";
import { cajaAmountInCents } from "@/lib/caja";
import { createAuditLog } from "@/lib/audit";
import { syncPackagePaymentState } from "@/lib/package-payment";
import { revalidatePath } from "next/cache";

export type RentalPriceSnapshot = {
  citaId: string; paqueteId: string; valorCita: string; valorPaquete: string; registrado: string;
};

async function readRental(tx: Prisma.TransactionClient, tenantId: number, citaId: string) {
  if (!/^[1-9]\d{0,17}$/.test(citaId)) throw Error("Cita inválida.");
  const cita = await tx.citasPsicologos.findFirst({ where: { id: BigInt(citaId), tenantId, empresaId: 3 },
    include: { PaqueteAdquirido: { include: { TerapiasPsicologos: true } } } });
  const pkg = cita?.PaqueteAdquirido;
  if (!cita || cita.realizada === null || !pkg || pkg.tenantId !== tenantId || pkg.estado === "CANCELADO" ||
      !/alquiler/i.test(pkg.TerapiasPsicologos.nombre)) throw Error("La corrección requiere un alquiler vigente de Psicólogos.");
  const count = await tx.citasPsicologos.count({ where: { paqueteId: pkg.id } });
  if (pkg.sesionesTotales !== 1 || count !== 1) throw Error("El paquete tiene varias sesiones o citas. Revisa el contrato antes de corregir su valor.");
  const payments = await tx.$queryRaw<{ registrado: string; inconsistencias: number }[]>`
    SELECT COALESCE(SUM(p.monto),0)::text AS registrado,
      COUNT(*) FILTER (WHERE m.id IS NULL OR m."tenantId"<>p."tenantId" OR m.tipo<>'INGRESO'
        OR m.monto<>p.monto OR m.fecha<>p.fecha OR m."metodoPago"<>p."metodoPago")::int AS inconsistencias
    FROM "PagoServicioPsicologia" p LEFT JOIN "MovimientoCaja" m ON m.id=p."movimientoCajaId"
    WHERE p."tenantId"=${tenantId} AND p."paqueteId"=${pkg.id} AND NOT p.reversado`;
  if (payments[0]?.inconsistencias) throw Error("El pago y el libro de caja requieren revisión antes de cambiar el valor.");
  return { cita, pkg, snapshot: { citaId, paqueteId: pkg.id.toString(), valorCita: (cita.valor ?? 0).toString(),
    valorPaquete: pkg.precioPagado.toString(), registrado: payments[0]?.registrado ?? "0" } };
}

export async function getRentalPriceCorrection(token: string, citaId: string): Promise<{ snapshot: RentalPriceSnapshot } | { error: string }> {
  try {
    const user = await requireReceptionUser(token);
    return { snapshot: (await readRental(prisma, user.tenantId, citaId)).snapshot };
  } catch (error) { return { error: error instanceof Error ? error.message : "No se pudo consultar el valor." }; }
}

/** Correct an entered price, preserving the booking, evidence and actual cash entries. */
export async function correctRentalPrice(token: string, input: {
  expected: RentalPriceSnapshot; valor: string; motivo: string;
}) {
  try {
    const user = await requireReceptionUser(token);
    const cents = cajaAmountInCents(input.valor);
    const motivo = input.motivo.trim();
    if (motivo.length < 10 || motivo.length > 240) throw Error("Explica la corrección en 10 a 240 caracteres.");
    const value = (cents / 100).toFixed(2);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${user.tenantId} FOR UPDATE`;
      const { cita, pkg, snapshot } = await readRental(tx, user.tenantId, input.expected.citaId);
      if (Object.keys(snapshot).some(key => snapshot[key as keyof RentalPriceSnapshot] !== input.expected[key as keyof RentalPriceSnapshot])) {
        throw Error("La cita o el pago cambiaron. Actualiza la pantalla y revisa los valores.");
      }
      if (Math.round(Number(snapshot.registrado) * 100) > cents) throw Error("El nuevo valor es menor que el dinero registrado. Revisa primero si corresponde una devolución.");
      if (Number(snapshot.valorCita) === Number(value) && Number(snapshot.valorPaquete) === Number(value)) return { changed: false, value };
      await tx.paqueteAdquirido.update({ where: { id: pkg.id, tenantId: user.tenantId }, data: { precioPagado: value } });
      await tx.citasPsicologos.update({ where: { id: cita.id, tenantId: user.tenantId }, data: { valor: value } });
      const payment = await syncPackagePaymentState(tx, user.tenantId, pkg.id);
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "CORRECT_RENTAL_PRICE", entidad: "Cita",
        entidadId: cita.id.toString(), detalles: { motivo, antes: snapshot,
          despues: { valorCita: value, valorPaquete: value, estadoPago: payment?.estadoPago ?? cita.estadoPago },
          pagosModificados: false, cajaModificada: false, horarioModificado: false }, tx, required: true });
      return { changed: true, value };
    }, { isolationLevel: "Serializable" });
    revalidatePath("/dashboard/citas"); revalidatePath(`/dashboard/citas/${input.expected.citaId}/editar`);
    revalidatePath("/dashboard"); revalidatePath("/dashboard/contabilidad");
    return { success: true, ...result };
  } catch (error) { return { error: error instanceof Error ? error.message : "No se pudo guardar la corrección. Revisa antes de reintentar." }; }
}

import type { Prisma } from "@/prisma/generated/prisma/client";

type DeleteTransaction = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
type AppointmentRow = {
  id: string; paqueteId: string | null; pacienteId: number | null; psicologoId: number | null; realizada: boolean | null;
  estadoPago: string | null; comprobantePath: string | null; snapshot: unknown;
};
type PackageRow = {
  id: string; sesionesTotales: number; sesionesConsumidas: number | null;
  saldoRestante: number; snapshot: unknown;
};

// The caller supplies a transaction and saves its mandatory audit before committing.
export async function deletePsychologyAppointment(tx: DeleteTransaction, tenantId: number, id: bigint) {
  if (tenantId !== 4) throw new Error("Cambia al sistema PSICOLOGOS.");
  // Same lock order as booking, cancellation and payment registration.
  await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id=${tenantId} FOR UPDATE`;
  const [cita] = await tx.$queryRaw<AppointmentRow[]>`
    SELECT c.id::text,c."paqueteId"::text,c."pacienteId",c."psicologoId",c.realizada,c."estadoPago"::text,c."comprobantePath",to_jsonb(c) AS snapshot
    FROM "CitasPsicologos" c WHERE c.id=${id} AND c."tenantId"=${tenantId} AND c."empresaId"=3 FOR UPDATE`;
  if (!cita) return { deleted: false as const };
  if (cita.realizada === true) throw new Error("Esta cita ya fue realizada. Revisa su estado antes de eliminarla.");
  if (cita.estadoPago === "CONCILIADO" || cita.comprobantePath?.trim()) {
    throw new Error("Esta cita tiene un pago o comprobante. Conserva el registro y usa Cancelar si corresponde.");
  }
  const [references] = await tx.$queryRaw<{ blocked: boolean }[]>`
    SELECT EXISTS(SELECT 1 FROM "PagoServicioPsicologia" WHERE "tenantId"=${tenantId}
      AND ("citaId"=${id} OR "paqueteId"=${cita.paqueteId ? BigInt(cita.paqueteId) : null}))
    OR EXISTS(SELECT 1 FROM "CargoRecepcion" WHERE "tenantId"=${tenantId} AND "citaId"=${id})
    OR EXISTS(SELECT 1 FROM "PsicologiaBotProposal" WHERE "citaId"=${id}) AS blocked`;
  if (references.blocked) throw new Error("Esta cita tiene pagos, cargos o una reserva vinculada. Usa Cancelar para conservar su historial.");

  let restoredPackage: { before: unknown; after: unknown } | null = null;
  // Cancelar already restores the session; deleting a cancelled row must not restore it again.
  if (cita.realizada === false && cita.paqueteId) {
    const packageId = BigInt(cita.paqueteId);
    const [pack] = await tx.$queryRaw<PackageRow[]>`
      SELECT p.id::text,p."sesionesTotales",p."sesionesConsumidas",p."saldoRestante",to_jsonb(p) AS snapshot
      FROM "PaqueteAdquirido" p JOIN "TerapiasPsicologos" t ON t.id=p."catalogoId" AND t."tenantId"=p."tenantId"
      WHERE p.id=${packageId} AND p."tenantId"=${tenantId} AND t."empresaId"=3
        AND ((${cita.pacienteId}::int IS NOT NULL AND p."clienteId"=${cita.pacienteId})
          OR (${cita.pacienteId}::int IS NULL AND p."clienteId" IS NULL AND p."usuarioId"=${cita.psicologoId}))
      FOR UPDATE OF p`;
    if (!pack || !Number.isInteger(pack.sesionesConsumidas) || !pack.sesionesConsumidas ||
        pack.sesionesConsumidas < 0 || pack.saldoRestante < 0 ||
        pack.saldoRestante + pack.sesionesConsumidas !== pack.sesionesTotales) {
      throw new Error("El saldo del paquete necesita revisión. La cita se conservó sin cambios.");
    }
    const [updated] = await tx.$queryRaw<{ snapshot: unknown }[]>`
      UPDATE "PaqueteAdquirido" p SET "saldoRestante"="saldoRestante"+1,"sesionesConsumidas"="sesionesConsumidas"-1
      WHERE p.id=${packageId} AND p."tenantId"=${tenantId}
      RETURNING to_jsonb(p) AS snapshot`;
    restoredPackage = { before: pack.snapshot, after: updated.snapshot };
  }
  const deleted = await tx.$executeRaw`DELETE FROM "CitasPsicologos" WHERE id=${id} AND "tenantId"=${tenantId} AND "empresaId"=3`;
  if (deleted !== 1) throw new Error("La cita cambió durante la operación. Vuelve a consultarla.");
  return { deleted: true as const, before: cita.snapshot, restoredPackage };
}

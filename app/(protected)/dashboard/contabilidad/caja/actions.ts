"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/constants/tenants";
import { getBogotaDayRange } from "@/lib/bogota-date";
import { validateCajaInput, type CajaInput, type CajaMovement } from "@/lib/caja";
import { createAuditLog } from "@/lib/audit";

async function cajaUser(token: string) {
  if (process.env.NEXT_PUBLIC_CAJA_DIARIA_ENABLED !== "true" && process.env.NEXT_PUBLIC_RECEPCION_ENABLED !== "true") throw new Error("La caja diaria aún no está habilitada.");
  const payload = verifyToken(token);
  if (!payload) throw new Error("No autorizado.");
  const user = await prisma.usuario.findUnique({
    where: { id: payload.userId },
    select: { id: true, tenantId: true, rol: true, activo: true, aprobado: true },
  });
  if (!user || !user.activo || !user.aprobado || user.tenantId !== PSYCHOLOGY_TENANT_ID ||
      !["ADMIN", "SU_ADMIN", "ASESOR"].includes(user.rol || "")) {
    throw new Error("No tienes acceso a la caja de este sistema.");
  }
  return user;
}

export async function getCajaMovements(token: string, fecha: string) {
  let user;
  try {
    user = await cajaUser(token);
    getBogotaDayRange(fecha);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Solicitud inválida." };
  }
  try {
    const rows = await prisma.$queryRaw<(Omit<CajaMovement, "createdAt"> & { createdAt: Date })[]>`
      SELECT m."id"::text, m."fecha"::text, m."tipo", m."metodoPago", m."monto"::text,
        m."concepto", COALESCE(m."referencia", '') AS "referencia", m."createdAt",
        CONCAT(u."nombre", ' ', u."apellido") AS "creadoPor"
      FROM "MovimientoCaja" m JOIN "Usuario" u ON u."id" = m."creadoPorId"
      WHERE m."tenantId" = ${user.tenantId} AND m."fecha" = ${fecha}::date
      ORDER BY m."createdAt" DESC, m."id" DESC
    `;
    return { movements: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) };
  } catch (error) {
    console.error("Error consultando caja diaria:", error);
    return { error: "No se pudo consultar la caja. Comunícate con el administrador." };
  }
}

export async function createCajaMovement(token: string, input: CajaInput) {
  let user;
  let data;
  try {
    user = await cajaUser(token);
    data = validateCajaInput(input);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Movimiento inválido." };
  }
  try {
    const id = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id"=${user.tenantId} FOR UPDATE`;
      const existing = await tx.$queryRaw<(Omit<CajaInput, "solicitudId"> & { id: string })[]>`
        SELECT "id"::text, "fecha"::text, "tipo", "metodoPago", "monto"::text, "concepto",
          COALESCE("referencia", '') AS "referencia"
        FROM "MovimientoCaja"
        WHERE "tenantId"=${user.tenantId} AND "creadoPorId"=${user.id} AND "solicitudId"=${data.solicitudId}::uuid`;
      const saved = existing[0];
      if (saved) {
        if (saved.fecha !== data.fecha || saved.tipo !== data.tipo || saved.metodoPago !== data.metodoPago ||
            saved.monto !== data.monto || saved.concepto !== data.concepto || saved.referencia !== data.referencia)
          throw new Error("Esta solicitud ya se usó para otro movimiento. Recarga la página antes de registrar uno nuevo.");
        return saved.id;
      }
      const inserted = await tx.$queryRaw<{ id: bigint }[]>`INSERT INTO "MovimientoCaja"
        ("tenantId","creadoPorId","fecha","tipo","metodoPago","monto","concepto","referencia","solicitudId")
        VALUES (${user.tenantId},${user.id},${data.fecha}::date,${data.tipo},${data.metodoPago},
          ${data.monto}::numeric,${data.concepto},${data.referencia || null},${data.solicitudId}::uuid) RETURNING "id"`;
      await createAuditLog({ tenantId: user.tenantId, usuarioId: user.id, accion: "CREATE", entidad: "MovimientoCaja",
        entidadId: inserted[0].id.toString(), detalles: { fecha: data.fecha, tipo: data.tipo, metodoPago: data.metodoPago,
          monto: data.monto, concepto: data.concepto, referencia: data.referencia }, tx });
      return inserted[0].id.toString();
    });
    return { success: true, id };
  } catch (error) {
    console.error("Error guardando movimiento de caja:", error);
    return { error: "No se pudo confirmar el registro. Reintenta con los mismos datos para evitar duplicados." };
  }
}

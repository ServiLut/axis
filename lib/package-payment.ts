import type { Prisma } from "@/prisma/generated/prisma/client";
import { PSYCHOLOGY_TENANT_ID } from "./constants/tenants";

// Only payments recorded in the integrated book can propagate a payment state.
// A legacy package with no book entries retains its existing appointment states.
export async function getPackagePaymentState(tx: Prisma.TransactionClient, tenantId: number, paqueteId: bigint) {
  if (process.env.NEXT_PUBLIC_RECEPCION_ENABLED !== "true" || tenantId !== PSYCHOLOGY_TENANT_ID) return null;
  const rows = await tx.$queryRaw<{ completo: boolean; metodoPago: string | null }[]>`
    SELECT p."precioPagado">0 AND COALESCE(SUM(c."monto") FILTER (WHERE NOT c."reversado"),0)>=p."precioPagado" AS "completo",
      CASE COUNT(DISTINCT c."metodoPago") FILTER (WHERE NOT c."reversado")
        WHEN 0 THEN NULL WHEN 1 THEN MIN(c."metodoPago") FILTER (WHERE NOT c."reversado") ELSE 'MIXTO' END AS "metodoPago"
    FROM "PaqueteAdquirido" p JOIN "PagoServicioPsicologia" c ON c."paqueteId"=p."id" AND c."tenantId"=p."tenantId"
    WHERE p."id"=${paqueteId} AND p."tenantId"=${tenantId}
    GROUP BY p."id",p."precioPagado"`;
  return rows[0] ? { estadoPago: rows[0].completo ? "CONCILIADO" as const : "PENDIENTE" as const,
    metodoPago: rows[0].metodoPago } : null;
}

export async function syncPackagePaymentState(tx: Prisma.TransactionClient, tenantId: number, paqueteId: bigint) {
  const state = await getPackagePaymentState(tx, tenantId, paqueteId);
  if (state) await tx.citasPsicologos.updateMany({
    where: { tenantId, paqueteId, realizada: { not: null } }, data: state,
  });
  return state;
}

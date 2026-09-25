import prisma from "./prisma";
import { verifyToken } from "./auth";
import { PSYCHOLOGY_TENANT_ID } from "./constants/tenants";

export async function requireFinanceUser(token: string, adminOnly = false) {
  const payload = verifyToken(token);
  if (!payload) throw new Error("No autorizado.");
  const user = await prisma.usuario.findUnique({ where: { id: payload.userId },
    select: { id: true, tenantId: true, rol: true, activo: true, aprobado: true } });
  const roles = adminOnly ? ["ADMIN", "SU_ADMIN"] : ["ADMIN", "SU_ADMIN", "ASESOR"];
  if (!user?.activo || !user.aprobado || !user.tenantId || !roles.includes(user.rol || "")) throw new Error("No tienes permisos para esta operación.");
  return user;
}
export async function requireReceptionUser(token: string, adminOnly = false) {
  if (process.env.NEXT_PUBLIC_RECEPCION_ENABLED !== "true") throw new Error("Recepción está pendiente de habilitación.");
  const user = await requireFinanceUser(token, adminOnly);
  if (user.tenantId !== PSYCHOLOGY_TENANT_ID) throw new Error("Cambia al sistema PSICOLOGOS.");
  return user;
}

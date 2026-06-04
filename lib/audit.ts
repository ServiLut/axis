import { Prisma } from "../prisma/generated/prisma/client";
import prisma from "./prisma";

// Type for the transaction client
type PrismaTransactionClient = Prisma.TransactionClient;

interface AuditLogParams {
  tenantId: number;
  usuarioId?: number | null;
  accion: string; // Flexible string, but typical values: "CREATE", "UPDATE", "DELETE", "LOGIN", "UPLOAD"
  entidad: string;
  entidadId: string | number;
  detalles?: unknown;
  metadata?: unknown;
  tx?: PrismaTransactionClient;
}

export async function createAuditLog({
  tenantId,
  usuarioId,
  accion,
  entidad,
  entidadId,
  detalles,
  metadata,
  tx,
}: AuditLogParams) {
  const db = tx || prisma;

  try {
    await db.auditoria.create({
      data: {
        tenantId,
        usuarioId,
        accion,
        entidad,
        entidadId: String(entidadId),
        detalles: (detalles as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        metadata: (metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
    // In a critical audit system, you might want to re-throw this.
    // For now, we log it to avoid crashing the user action if logging fails.
  }
}

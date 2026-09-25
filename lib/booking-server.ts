import type { Prisma } from "@/prisma/generated/prisma/client";
import { rentalQuote } from "./booking";

type Booking = { tenantId: number; psicologoId: number | null; consultorioId: bigint | null; inicio: Date; fin: Date; excludeId?: bigint };
export async function lockAndValidateBooking(tx: Prisma.TransactionClient, input: Booking) {
  await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${input.tenantId} FOR UPDATE`;
  if (!input.psicologoId || !Number.isSafeInteger(input.psicologoId)) throw new Error("Toda cita o reserva requiere un profesional asignado.");
  if (!(await tx.usuario.findFirst({ where: { id: input.psicologoId, tenantId: input.tenantId, activo: true, rol: "TECNICO" }, select: { id: true } }))) {
    throw new Error("El profesional no pertenece al sistema o está inactivo.");
  }
  if (input.consultorioId && !(await tx.consultorios.findFirst({ where: { id: input.consultorioId, tenantId: input.tenantId }, select: { id: true } }))) throw new Error("Consultorio no encontrado en este sistema.");
  const occupied = await tx.citasPsicologos.findFirst({ where: {
    tenantId: input.tenantId, realizada: { not: null }, ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    horaInicio: { lt: input.fin }, horaFin: { gt: input.inicio },
    OR: [{ psicologoId: input.psicologoId }, ...(input.consultorioId ? [{ consultorioId: input.consultorioId }] : [])],
  }, select: { id: true } });
  if (occupied) throw new Error(`El profesional o consultorio ya tiene una reserva en ese horario (CITA-${occupied.id}).`);
}

export async function normalizedRental(tx: Prisma.TransactionClient, tenantId: number, terapiaId: bigint | null, inicio: Date, fin: Date) {
  if (!terapiaId) return null;
  const therapy = await tx.terapiasPsicologos.findFirst({ where: { id: terapiaId, tenantId, activo: true } });
  if (!therapy) throw new Error("El servicio no está activo en este sistema.");
  if (!/alquiler/i.test(therapy.nombre)) return null;
  if (therapy.cantidadSesiones !== 1) throw new Error("Revisa el contrato del paquete de alquiler antes de cambiar su duración.");
  const quote = rentalQuote((fin.getTime() - inicio.getTime()) / 60000, Number(therapy.precioBase).toFixed(2));
  return { valor: quote.amount, fin: new Date(inicio.getTime() + quote.minutes * 60000) };
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorizePsychologyIntegration } from "@/lib/psychology-integration-auth";
import { bogotaToday, getBogotaDayRange } from "@/lib/bogota-date";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const scope = { tenantId: 4, empresaId: 3 } as const;
const response = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" },
});

/** Phase 1: read-only API. No patient, document, address, observation or payment data. */
export async function GET(request: NextRequest) {
  const status = authorizePsychologyIntegration(request.headers.get("authorization"));
  if (status !== 200) return response({ error: status === 503 ? "Integración no habilitada" : "No autorizado" }, status);
  const params = request.nextUrl.searchParams;
  if (params.has("tenantId") || params.has("empresaId")) return response({ error: "El ámbito de esta integración es fijo" }, 400);
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { nombre: true } });
    const company = await prisma.empresa.findFirst({ where: { id: scope.empresaId, tenantId: scope.tenantId, estado: true }, select: { nombre: true } });
    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    if (!tenant || !company || normalize(tenant.nombre) !== "PSICOLOGOS" || normalize(company.nombre) !== "PSICOLOGOS EN COLOMBIA") return response({ error: "Ámbito de Psicólogos no verificado" }, 503);
    const resource = params.get("resource") || "status";
    const identity = { tenantId: scope.tenantId, companyId: scope.empresaId, tenant: tenant.nombre, company: company.nombre, timezone: "America/Bogota" };
    if (resource === "status") {
      const configured=process.env.PSICOLOGOS_AUTOMATION_ENABLED==='true';
      const rows=configured?await prisma.$queryRaw<{enabled:boolean}[]>`SELECT enabled FROM "PsicologiaBotConfig" WHERE id=4`:[];
      const active=rows[0]?.enabled===true;
      return response({ ...identity, version: 2, capabilities: ["catalog.read", "availability.read",...(active?["reception.process","booking.confirmed-proposal"]:[])],
        bookingEnabled: active, whatsappEnabled: active, automationMode:active?'human-reviewed-reception':'disabled',
        bookingRequiresExactConfirmations:true, channelHealth:'requires-live-check' });
    }
    if (resource === "catalog") {
      const [services, professionals, rooms] = await Promise.all([
        prisma.terapiasPsicologos.findMany({ where: { ...scope, activo: true },
          select: { id: true, nombre: true, categoria: true, cantidadSesiones: true, precioBase: true }, orderBy: { nombre: "asc" }, take: 501 }),
        prisma.usuario.findMany({ where: { ...scope, activo: true, rol: "TECNICO" },
          select: { id: true, nombre: true, apellido: true }, orderBy: { nombre: "asc" }, take: 501 }),
        prisma.consultorios.findMany({ where: scope, select: { id: true, nombre: true }, orderBy: { id: "asc" }, take: 501 }),
      ]);
      if ([services, professionals, rooms].some(rows => rows.length > 500)) return response({ error: "Catálogo excede el límite; revisión requerida" }, 409);
      return response({ ...identity, currency: "COP", services: services.map(s => ({ ...s, id: s.id.toString(), precioBase: s.precioBase.toFixed(2) })),
        professionals, rooms: rooms.map(r => ({ ...r, id: r.id.toString() })),
        bookingHours: { opens: "07:00", closes: "20:00", appliesTo: "rental" },
        pricesAreCatalogValues: true, quickRepliesMustBeComparedBeforeSending: true });
    }
    if (resource === "availability") {
      const date = params.get("date") || bogotaToday();
      let range;
      try { range = getBogotaDayRange(date); } catch { return response({ error: "Fecha inválida" }, 400); }
      const today = getBogotaDayRange().start.getTime();
      if (range.start.getTime() < today || range.start.getTime() > today + 90 * 86400000) return response({ error: "Consulta una fecha entre hoy y los próximos 90 días" }, 400);
      const rawProfessional = params.get("professionalId");
      const rawRoom = params.get("roomId");
      if (!rawProfessional || !/^[1-9]\d{0,8}$/.test(rawProfessional) || (rawRoom && !/^[1-9]\d{0,15}$/.test(rawRoom))) return response({ error: "Profesional obligatorio y consultorio válido" }, 400);
      const professionalId = Number(rawProfessional);
      const roomId = rawRoom ? BigInt(rawRoom) : null;
      const professional = await prisma.usuario.findFirst({ where: { id: professionalId, ...scope, activo: true, rol: "TECNICO" }, select: { id: true } });
      const room = roomId ? await prisma.consultorios.findFirst({ where: { id: roomId, ...scope }, select: { id: true } }) : null;
      if (!professional || (roomId && !room)) return response({ error: "Profesional o consultorio no disponible en Psicólogos" }, 404);
      // A null time prevents us from asserting that the calendar is complete.
      const missingTimes = await prisma.citasPsicologos.count({ where: { tenantId: scope.tenantId, realizada: { not: null }, fechaCita: { gte: range.start, lt: range.end },
        AND: [{ OR: [{ psicologoId: professionalId }, ...(roomId ? [{ consultorioId: roomId }] : [])] }, { OR: [{ horaInicio: null }, { horaFin: null }] }] } });
      const rows = await prisma.citasPsicologos.findMany({ where: { tenantId: scope.tenantId, realizada: { not: null }, horaInicio: { lt: range.end }, horaFin: { gt: range.start },
        OR: [{ psicologoId: professionalId }, ...(roomId ? [{ consultorioId: roomId }] : [])] },
        select: { horaInicio: true, horaFin: true, psicologoId: true, consultorioId: true }, orderBy: { horaInicio: "asc" }, take: 501 });
      if (rows.length > 500) return response({ error: "Agenda excede el límite; revisión requerida" }, 409);
      return response({ ...identity, date, professionalId, roomId: roomId?.toString() || null,
        coverageComplete: missingTimes === 0, recordsWithMissingTime: missingTimes,
        busy: rows.map(row => ({ start: row.horaInicio?.toISOString(), end: row.horaFin?.toISOString(), professionalBusy: row.psicologoId === professionalId, roomBusy: roomId !== null && row.consultorioId === roomId })),
        requiresProfessionalConfirmation: true, mustRecheckBeforeBooking: true });
    }
    return response({ error: "Recurso no disponible" }, 404);
  } catch {
    // Do not leak credentials, queries or patient data through integration errors.
    return response({ error: "No se pudo consultar Axis" }, 503);
  }
}

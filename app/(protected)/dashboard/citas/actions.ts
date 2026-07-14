"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma, Rol, EstadoPagoOrden } from "@/prisma/generated/prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { createClient } from "@supabase/supabase-js";
import { createAuditLog } from "@/lib/audit";

// Helper to serialize BigInt and Decimal
const serializeBigInt = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj);
  if (obj instanceof Date) return obj.toISOString(); // Serialize Dates to ISO strings
  if (Prisma.Decimal.isDecimal(obj)) return Number(obj);
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === "object") {
    // Check if it looks like a Decimal but instance check failed (e.g. crossing boundaries)
    if ('s' in obj && 'e' in obj && 'd' in obj && 'toFixed' in obj) {
        return Number(obj);
    }
    const newObj: Record<string, unknown> = {};
    const entries = Object.entries(obj as Record<string, unknown>);
    for (const [key, value] of entries) {
      newObj[key] = serializeBigInt(value);
    }
    return newObj;
  }
  return obj;
};

type PackageOwnerInput = {
  tenantId: number;
  pacienteId: number | null;
  psicologoId: number | null;
  terapiaId: bigint;
  excludePackageId?: bigint | null;
};

const activePackageOwnerWhere = ({
  pacienteId,
  psicologoId,
}: Pick<PackageOwnerInput, "pacienteId" | "psicologoId">) => {
  if (pacienteId) return { clienteId: pacienteId };
  if (psicologoId) return { clienteId: null, usuarioId: psicologoId };
  return null;
};

const consumePackageSession = async (
  tx: Prisma.TransactionClient,
  packageId: bigint
) => {
  const result = await tx.paqueteAdquirido.updateMany({
    where: {
      id: packageId,
      saldoRestante: { gt: 0 },
    },
    data: {
      saldoRestante: { decrement: 1 },
      sesionesConsumidas: { increment: 1 },
    },
  });

  if (result.count === 0) {
    throw new Error("El paquete no tiene saldo disponible");
  }
};

const restorePackageSession = async (
  tx: Prisma.TransactionClient,
  packageId: bigint
) => {
  const result = await tx.paqueteAdquirido.updateMany({
    where: {
      id: packageId,
      sesionesConsumidas: { gt: 0 },
    },
    data: {
      saldoRestante: { increment: 1 },
      sesionesConsumidas: { decrement: 1 },
    },
  });

  if (result.count === 0) {
    throw new Error("El paquete no tiene una sesión consumida para restaurar");
  }
};

const findReusableActivePackage = async (
  tx: Prisma.TransactionClient,
  input: PackageOwnerInput
) => {
  const ownerWhere = activePackageOwnerWhere(input);
  if (!ownerWhere) return null;

  return tx.paqueteAdquirido.findFirst({
    where: {
      tenantId: input.tenantId,
      catalogoId: input.terapiaId,
      estado: "ACTIVO",
      saldoRestante: { gt: 0 },
      ...ownerWhere,
      ...(input.excludePackageId
        ? { id: { not: input.excludePackageId } }
        : {}),
    },
    orderBy: [{ fechaCompra: "asc" }, { id: "asc" }],
  });
};

const resolvePackageForScheduledCita = async (
  tx: Prisma.TransactionClient,
  input: PackageOwnerInput & { valor: number | null }
) => {
  const ownerWhere = activePackageOwnerWhere(input);
  if (!ownerWhere) {
    throw new Error("Debe existir un paciente o psicólogo para asociar el paquete");
  }

  const reusablePackage = await findReusableActivePackage(tx, input);
  if (reusablePackage) {
    await consumePackageSession(tx, reusablePackage.id);
    return reusablePackage.id;
  }

  const terapia = await tx.terapiasPsicologos.findUnique({
    where: { id: input.terapiaId },
  });

  if (!terapia) {
    throw new Error("Terapia no encontrada");
  }

  const totalSessions = Math.max(1, terapia.cantidadSesiones || 1);
  const nuevoPaquete = await tx.paqueteAdquirido.create({
    data: {
      tenantId: input.tenantId,
      clienteId: input.pacienteId,
      usuarioId: input.pacienteId ? null : input.psicologoId,
      catalogoId: input.terapiaId,
      sesionesTotales: totalSessions,
      sesionesConsumidas: 1,
      saldoRestante: Math.max(0, totalSessions - 1),
      fechaCompra: new Date(),
      precioPagado: input.valor ?? terapia.precioBase,
      estado: "ACTIVO",
    },
  });

  return nuevoPaquete.id;
};

type CitaSerialized = {
  id: number;
  numeroOrden: string;
  cliente: unknown;
  empresa: unknown;
  servicio: unknown;
  tecnico: unknown;
  tipoServicio: unknown;
  creadoPor: unknown;
  fechaVisita: unknown;
  horaInicio: unknown;
  horaFin: unknown;
  valorCotizado: number | null;
  observacion: string | null;
  direccionTexto: string;
  municipio: string;
  barrio: string;
  estado: string;
  realizada: boolean | null;
  estadoServicio: { id: number; nombre: string };
  createdAt: unknown;
  comprobantePath?: string | null;
  metodoPago?: string | null;
  estadoPago?: EstadoPagoOrden | null;
  PaqueteAdquirido?: unknown;
  consultorioNombre?: string | null;
  paqueteNombre?: string | null;
};

// Estado que llega desde el filtro de la UI; se traduce al campo nullable `realizada`.
type EstadoCitaFilter = "all" | "programada" | "realizada" | "cancelada";

export async function getCitas(
  token: string,
  page: number = 1,
  limit: number = 10,
  filters: {
    term?: string;
    empresaId?: string;
    psicologoId?: string; // equivalent to tecnicoId
    consultorioId?: string;
    paqueteId?: string; // actually terapiaId (catalogoId)
    estadoCita?: EstadoCitaFilter;
    estadoPago?: EstadoPagoOrden | "all";
    startDate?: string;
    endDate?: string;
    tenantId?: string;
  } = {}
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const where: Prisma.CitasPsicologosWhereInput = {};
    const appendAndFilter = (filter: Prisma.CitasPsicologosWhereInput) => {
      const currentAnd = where.AND;
      where.AND = currentAnd
        ? Array.isArray(currentAnd)
          ? [...currentAnd, filter]
          : [currentAnd, filter]
        : [filter];
    };

    if (usuario.rol === Rol.SU_ADMIN) {
        if (filters.tenantId && filters.tenantId !== "all") {
            where.tenantId = Number(filters.tenantId);
        }
    } else {
        where.tenantId = usuario.tenantId;
    }

    // Search filter
    if (filters.term) {
      const term = filters.term;
      const searchWords = term.split(/\s+/).filter(word => word.length > 0);
      const isNumeric = /^\d+$/.test(term);

      where.OR = [
        {
          Cliente: {
            AND: searchWords.map(word => ({
              OR: [
                { nombre: { contains: word, mode: "insensitive" } },
                { apellido: { contains: word, mode: "insensitive" } },
              ]
            }))
          }
        },
        { Cliente: { numeroDocumento: { contains: term, mode: "insensitive" } } },
        { Cliente: { telefono: { contains: term, mode: "insensitive" } } },
      ];

      if (isNumeric) {
        where.OR.push({ id: BigInt(term) });
      }
    }

    if (filters.empresaId && filters.empresaId !== "all") {
      where.empresaId = Number(filters.empresaId);
    }

    if (filters.psicologoId && filters.psicologoId !== "all") {
      where.psicologoId = Number(filters.psicologoId);
    }

    if (filters.consultorioId && filters.consultorioId !== "all") {
        where.consultorioId = BigInt(filters.consultorioId);
    }

    if (filters.paqueteId && filters.paqueteId !== "all") {
        // Filter by the type of therapy (catalogoId) in the acquired package
        where.PaqueteAdquirido = { catalogoId: BigInt(filters.paqueteId) };
    }

    // La tabla guarda el estado en `realizada`: false = programada, true = realizada,
    // null = cancelada. Por eso el filtro no necesita una columna nueva.
    if (filters.estadoCita && filters.estadoCita !== "all") {
      if (filters.estadoCita === "programada") {
        where.realizada = false;
      } else if (filters.estadoCita === "realizada") {
        where.realizada = true;
      } else if (filters.estadoCita === "cancelada") {
        where.realizada = null;
      }
    }

    if (
      filters.estadoPago &&
      filters.estadoPago !== "all" &&
      Object.values(EstadoPagoOrden).includes(filters.estadoPago)
    ) {
      if (filters.estadoPago === EstadoPagoOrden.PENDIENTE) {
        appendAndFilter({
          OR: [
            { estadoPago: EstadoPagoOrden.PENDIENTE },
            { estadoPago: null },
          ],
        });
      } else {
        appendAndFilter({ estadoPago: filters.estadoPago });
      }
    }

    // Date Filter
    if (filters.startDate || filters.endDate) {
      where.fechaCita = {};
      const TIMEZONE = "America/Bogota";
      if (filters.startDate) {
        where.fechaCita.gte = fromZonedTime(`${filters.startDate}T00:00:00`, TIMEZONE);
      }
      if (filters.endDate) {
        where.fechaCita.lte = fromZonedTime(`${filters.endDate}T23:59:59.999`, TIMEZONE);
      }
    }

    const skip = (page - 1) * limit;

    const [total, citas] = await Promise.all([
      prisma.citasPsicologos.count({ where }),
      prisma.citasPsicologos.findMany({
        where,
        orderBy: { fechaCita: "desc" },
        skip,
        take: limit,
        include: {
          Cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              tipoDocumento: true,
              numeroDocumento: true,
              telefono: true,
              correo: true,
            },
          },
          Empresa: { select: { id: true, nombre: true } },
          Servicio_CitasPsicologos_servicioIdToServicio: { select: { nombre: true } },
          Usuario_CitasPsicologos_psicologoIdToUsuario: { select: { nombre: true, apellido: true } },
          Servicio_CitasPsicologos_tipoServicioToServicio: { select: { id: true, nombre: true } },
          Usuario_CitasPsicologos_creadoPorIdToUsuario: { select: { nombre: true, apellido: true } },
          PaqueteAdquirido: {
             include: {
               TerapiasPsicologos: true
             }
          },
          consultorios: { select: { nombre: true } }
        },
      }),
    ]);

    const paqueteIds = Array.from(
      new Set(
        citas
          .map((cita) => cita.paqueteId)
          .filter((paqueteId): paqueteId is bigint => paqueteId != null)
          .map((paqueteId) => paqueteId.toString())
      )
    ).map((paqueteId) => BigInt(paqueteId));

    const citasRealizadasDelPaquete =
      paqueteIds.length > 0
        ? await prisma.citasPsicologos.findMany({
            where: {
              paqueteId: { in: paqueteIds },
              realizada: true,
            },
            orderBy: [
              { fechaCita: "asc" },
              { horaInicio: "asc" },
              { id: "asc" },
            ],
            select: {
              id: true,
              paqueteId: true,
            },
          })
        : [];

    const sesionesRealizadasPorPaqueteId = new Map<string, number>();

    citasRealizadasDelPaquete.forEach((citaRealizada) => {
      if (!citaRealizada.paqueteId) return;

      const paqueteId = citaRealizada.paqueteId.toString();
      const sesionesRealizadas =
        (sesionesRealizadasPorPaqueteId.get(paqueteId) ?? 0) + 1;

      sesionesRealizadasPorPaqueteId.set(paqueteId, sesionesRealizadas);
    });

    // Map to structure expected by UI (similar to OrdenServicio)
    const citasSerialized: CitaSerialized[] = citas.map((cita) => {
      const serialized = serializeBigInt(cita) as Record<string, unknown>;
      const sesionesRealizadas = cita.paqueteId
        ? sesionesRealizadasPorPaqueteId.get(cita.paqueteId.toString()) ?? 0
        : 0;
      const paqueteAdquirido =
        serialized["PaqueteAdquirido"] && typeof serialized["PaqueteAdquirido"] === "object"
          ? {
              ...(serialized["PaqueteAdquirido"] as Record<string, unknown>),
              sesionesRealizadas,
            }
          : serialized["PaqueteAdquirido"];
      
      const terapiaNombre = cita.PaqueteAdquirido?.TerapiasPsicologos?.nombre;
      const servicioNombre = cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre;
      
      const servicioObj = {
          nombre: terapiaNombre || servicioNombre || "Sin servicio especificado"
      };

      return {
        id: (serialized['id'] as number) || 0,
        numeroOrden: `CITA-${serialized['id']}`,
        cliente: serialized['Cliente'],
        empresa: serialized['Empresa'],
        servicio: servicioObj,
        tecnico: serialized['Usuario_CitasPsicologos_psicologoIdToUsuario'],
        tipoServicio: serialized['Servicio_CitasPsicologos_tipoServicioToServicio'],
        creadoPor: serialized['Usuario_CitasPsicologos_creadoPorIdToUsuario'],
        fechaVisita: serialized['fechaCita'],
        horaInicio: serialized['horaInicio'],
        horaFin: serialized['horaFin'],
        valorCotizado: serialized['valor'] ? Number(serialized['valor']) : null,
        observacion: (serialized['observacion'] as string) || null,
        direccionTexto: "Consultorio",
        municipio: "",
        barrio: "",
        estado: "PROGRAMADO",
        realizada: serialized['realizada'] === null ? null : (serialized['realizada'] as boolean),
        metodoPago: (serialized['metodoPago'] as string) || null,
        estadoPago: (serialized['estadoPago'] as EstadoPagoOrden) || null,
        estadoServicio: { id: 0, nombre: "Programado" },
        createdAt: serialized['createdAt'],
        comprobantePath: (serialized['comprobantePath'] as string) || null,
        PaqueteAdquirido: paqueteAdquirido,
        consultorioNombre: cita.consultorios?.nombre || null,
        paqueteNombre: terapiaNombre || null,
      };
    });

    return { ordenes: citasSerialized, total, totalPages: Math.ceil(total / limit) };
  } catch (error) {
    console.error("Error obteniendo citas:", error);
    return { error: "Error al cargar las citas" };
  }
}

export async function getCita(token: string, id: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    const cita = await prisma.citasPsicologos.findFirst({
      where: { id: BigInt(id), tenantId: usuario?.tenantId },
      include: {
        Cliente: { include: { direcciones: true, vehiculos: true } },
        Empresa: true,
        Servicio_CitasPsicologos_servicioIdToServicio: true,
        Usuario_CitasPsicologos_psicologoIdToUsuario: true,
        Servicio_CitasPsicologos_tipoServicioToServicio: true,
        Usuario_CitasPsicologos_creadoPorIdToUsuario: true,
        PaqueteAdquirido: {
            include: {
                TerapiasPsicologos: true
            }
        },
        consultorios: true
      },
    });

    if (!cita) return { error: "Cita no encontrada" };

    const sesionesRealizadas = cita.paqueteId
      ? await prisma.citasPsicologos.count({
          where: {
            paqueteId: cita.paqueteId,
            realizada: true,
          },
        })
      : 0;

    const serialized = serializeBigInt(cita) as Record<string, unknown>;
    const paqueteAdquirido =
      serialized["PaqueteAdquirido"] && typeof serialized["PaqueteAdquirido"] === "object"
        ? {
            ...(serialized["PaqueteAdquirido"] as Record<string, unknown>),
            sesionesRealizadas,
          }
        : serialized["PaqueteAdquirido"];
    
    const terapiaNombre = cita.PaqueteAdquirido?.TerapiasPsicologos?.nombre;
    const servicioNombre = cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre;
    
    const servicioObj = {
        ...cita.Servicio_CitasPsicologos_servicioIdToServicio,
        nombre: terapiaNombre || servicioNombre || "Sin servicio"
    };

    const citaMapped = {
      ...serialized,
      // Map fields to match OrdenServicio structure where possible for reusing UI components
      clienteId: serialized['pacienteId'],
      cliente: serialized['Cliente'],
      empresa: serialized['Empresa'],
      servicio: servicioObj,
      tecnico: serialized['Usuario_CitasPsicologos_psicologoIdToUsuario'],
      tipoServicio: serialized['Servicio_CitasPsicologos_tipoServicioToServicio'],
      creadoPor: serialized['Usuario_CitasPsicologos_creadoPorIdToUsuario'],
      fechaVisita: serialized['fechaCita'],
      valorCotizado: serialized['valor'],
      estado: "PROGRAMADO",
      estadoServicio: { id: 0, nombre: "Programado" },
      direccionTexto: "Consultorio",
      PaqueteAdquirido: paqueteAdquirido,
    };

    return { orden: citaMapped };
  } catch (error) {
    console.error("Error obteniendo cita:", error);
    return { error: "Error al cargar la cita" };
  }
}

export async function createCita(token: string, formData: FormData) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, id: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const clienteValue = formData.get("cliente");
    const pacienteId = clienteValue ? Number(clienteValue) : null;
    
    const empresaId = formData.get("empresa") ? Number(formData.get("empresa")) : 3;
    const servicioId = formData.get("servicio") ? Number(formData.get("servicio")) : null; // For legacy or non-therapy services
    
    // New fields for Packages/Therapies
    const paqueteIdRaw = formData.get("paqueteId");
    const paqueteId = paqueteIdRaw ? BigInt(paqueteIdRaw.toString()) : null;
    
    const terapiaIdRaw = formData.get("terapiaId");
    const terapiaId = terapiaIdRaw ? BigInt(terapiaIdRaw.toString()) : null;

    const psicologoId = formData.get("tecnico") ? Number(formData.get("tecnico")) : null; 
    const tipoServicio = formData.get("tipoServicio") ? Number(formData.get("tipoServicio")) : null;
    
    const fechaCitaStr = formData.get("fechaVisita") as string;
    const horaInicioStr = formData.get("horaInicio") as string;
    const horaFinStr = formData.get("horaFin") as string;
    const observacion = formData.get("observacion") as string;
    const valor = formData.get("valorCotizado") ? Number(formData.get("valorCotizado")) : null;
    const metodoPago = formData.get("metodoPago") ? formData.get("metodoPago")?.toString() : null;
    const consultorioRaw = formData.get("consultorio");
    const consultorioId = consultorioRaw ? BigInt(consultorioRaw.toString()) : null;

    const TIMEZONE = "America/Bogota";
    let fechaCita: Date | null = null;
    let horaInicio: Date | null = null;
    let horaFin: Date | null = null;

    if (fechaCitaStr) {
      fechaCita = fromZonedTime(`${fechaCitaStr}T00:00`, TIMEZONE);
    }
    if (fechaCitaStr && horaInicioStr) {
      horaInicio = fromZonedTime(`${fechaCitaStr}T${horaInicioStr}`, TIMEZONE);
    }
    if (fechaCitaStr && horaFinStr) {
      horaFin = fromZonedTime(`${fechaCitaStr}T${horaFinStr}`, TIMEZONE);
    }

    if (consultorioId && horaInicio && horaFin) {
      if (horaInicio >= horaFin) {
        return { error: "La hora de inicio debe ser anterior a la hora de fin" };
      }

      const overlappingCita = await prisma.citasPsicologos.findFirst({
        where: {
          consultorioId,
          tenantId: usuario.tenantId,
          realizada: false,
          AND: [
            { horaInicio: { lt: horaFin } },
            { horaFin: { gt: horaInicio } }
          ]
        },
        include: { consultorios: true }
      });

      if (overlappingCita) {
        return { error: `El consultorio ${overlappingCita.consultorios?.nombre || ""} ya está ocupado en ese horario` };
      }
    }

    const nuevaCita = await prisma.$transaction(async (tx) => {
        let finalPaqueteId: bigint | null = null;

        if (paqueteId) {
            const paquete = await tx.paqueteAdquirido.findFirst({
                where: { id: paqueteId, tenantId: usuario.tenantId },
            });

            if (!paquete) {
                throw new Error("Paquete no encontrado");
            }

            await consumePackageSession(tx, paqueteId);
            finalPaqueteId = paqueteId;
        }

        // Si ya existe un paquete activo para el mismo paciente/terapia,
        // se reutiliza. Crear otro acá es exactamente cómo nacen los duplicados.
        if (!finalPaqueteId && terapiaId && (pacienteId || psicologoId)) {
            finalPaqueteId = await resolvePackageForScheduledCita(tx, {
                tenantId: usuario.tenantId,
                pacienteId,
                psicologoId,
                terapiaId,
                valor,
            });
        }

        return tx.citasPsicologos.create({
          data: {
            tenantId: usuario.tenantId,
            empresaId,
            pacienteId,
            servicioId,
            creadoPorId: usuario.id,
            psicologoId,
            tipoServicio,
            fechaCita,
            horaInicio,
            horaFin,
            valor, // Step 1: Full Value, Step 2: 0 (from Frontend)
            observacion,
            metodoPago,
            paqueteId: finalPaqueteId,
            consultorioId,
          },
        });
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "CREATE",
      entidad: "Cita",
      entidadId: Number(nuevaCita.id),
      detalles: {
        descripcion: "Cita creada",
        despues: serializeBigInt(nuevaCita),
      },
    });

    revalidatePath("/dashboard/citas");
    return { success: true, message: "Cita creada correctamente" };
  } catch (error) {
    console.error("Error creando cita:", error);
    return { error: "Error al crear la cita" };
  }
}

export async function getCitasStats(token: string) {
    const payload = verifyToken(token);
    if (!payload) return { error: "No autorizado" };
    
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.userId }});
    const tenantId = usuario?.tenantId || 0;
    const where: Prisma.CitasPsicologosWhereInput = usuario?.rol === Rol.SU_ADMIN ? {} : { tenantId };
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const whereMonth: Prisma.CitasPsicologosWhereInput = {
        ...where,
        fechaCita: {
            gte: startOfMonth,
            lte: endOfMonth
        }
    };

    const [
        total,
        programadas,
        realizadas,
        alquiler,
        totalMes,
        realizadasMes,
        alquilerMes
    ] = await Promise.all([
        prisma.citasPsicologos.count({ where }),
        prisma.citasPsicologos.count({ where: { ...where, realizada: false } }),
        prisma.citasPsicologos.count({ where: { ...where, realizada: true } }),
        prisma.citasPsicologos.count({ 
            where: { 
                ...where, 
                OR: [
                    { PaqueteAdquirido: { TerapiasPsicologos: { nombre: { contains: "alquiler", mode: "insensitive" } } } },
                    { PaqueteAdquirido: { catalogoId: BigInt(49) } }
                ]
            } 
        }),
        prisma.citasPsicologos.count({ where: whereMonth }),
        prisma.citasPsicologos.count({ where: { ...whereMonth, realizada: true } }),
        prisma.citasPsicologos.count({ 
            where: { 
                ...whereMonth, 
                OR: [
                    { PaqueteAdquirido: { TerapiasPsicologos: { nombre: { contains: "alquiler", mode: "insensitive" } } } },
                    { PaqueteAdquirido: { catalogoId: BigInt(49) } }
                ]
            } 
        }),
    ]);
    
    return {
        stats: {
            totalOrdenes: total,
            programadas,
            realizadas,
            alquiler,
            paquetes: total - alquiler,
            totalMes,
            realizadasMes,
            alquilerMes,
            paquetesMes: totalMes - alquilerMes
        }
    };
}

export async function deleteCita(token: string, id: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
     const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    const cita = await prisma.citasPsicologos.findFirst({
        where: { id: BigInt(id), tenantId: usuario?.tenantId }
    });

    if (cita) {
        await prisma.citasPsicologos.deleteMany({
          where: {
            id: BigInt(id),
            tenantId: usuario?.tenantId
          }
        });

        await createAuditLog({
            tenantId: usuario?.tenantId || 0, // Fallback if tenantId is missing, though unlikely
            usuarioId: payload.userId,
            accion: "DELETE",
            entidad: "Cita",
            entidadId: id,
            detalles: {
                descripcion: "Cita eliminada",
                antes: serializeBigInt(cita),
            },
        });
    }

    revalidatePath("/dashboard/citas");
    return { success: true, message: "Cita eliminada" };
  } catch (error) {
    console.error("Error deleting cita:", error);
    return { error: "Error al eliminar la cita" };
  }
}

export async function getFormDataCitas(token: string) {
    const payload = verifyToken(token);
    if (!payload) return { error: "No autorizado" };

    try {
        const usuario = await prisma.usuario.findUnique({
             where: { id: payload.userId },
             select: { tenantId: true },
        });
        
        const tenantId = usuario?.tenantId || 0;
        const whereActive = { tenantId, activo: true };

        const [empresas, servicios, tecnicos, tiposServicios, consultorios, metodosPago, terapias] = await Promise.all([
             prisma.empresa.findMany({ where: { tenantId } }),
             prisma.servicio.findMany({ 
                 where: whereActive,
                 include: { empresa: true } 
             }),
             prisma.usuario.findMany({ 
                 where: { 
                     tenantId: 4, 
                     rol: Rol.TECNICO
                 } 
             }),
             prisma.tipoServicio.findMany({ where: whereActive }),
             prisma.consultorios.findMany({ where: { tenantId } }),
             prisma.metodoPago.findMany({ where: whereActive }),
             prisma.terapiasPsicologos.findMany({ where: { activo: true } })
        ]);

        return {
            empresas: empresas.map(serializeBigInt),
            servicios: servicios.map(serializeBigInt),
            tecnicos: tecnicos.map(serializeBigInt),
            tiposServicios: tiposServicios.map(serializeBigInt),
            consultorios: consultorios.map(serializeBigInt),
            metodosPago: metodosPago.map(serializeBigInt),
            terapias: terapias.map(serializeBigInt),
            estadosServicio: [{id: 1, nombre: "Programado"}],
        };

    } catch (error) {
        console.error("Error form data:", error);
        return { error: "Error cargando datos" };
    }
}

export async function getConsultorios(token: string) {
    const payload = verifyToken(token);
    if (!payload) return { error: "No autorizado" };

    try {
        const usuario = await prisma.usuario.findUnique({
             where: { id: payload.userId },
             select: { tenantId: true },
        });
        
        const tenantId = usuario?.tenantId || 0;
        
        const consultorios = await prisma.consultorios.findMany({
            where: { tenantId }
        });

        return { consultorios: serializeBigInt(consultorios) };
    } catch (error) {
        console.error("Error fetching consultorios:", error);
        return { error: "Error al cargar consultorios" };
    }
}

export async function getClientPackages(token: string, clientId: number) {
    const payload = verifyToken(token);
    if (!payload) return { error: "No autorizado" };

    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId },
            select: { tenantId: true, rol: true },
        });
        if (!usuario) return { error: "Usuario no encontrado" };

        const where: Prisma.PaqueteAdquiridoWhereInput = {
            clienteId: clientId,
            estado: "ACTIVO",
            saldoRestante: { gt: 0 },
        };

        if (usuario.rol !== Rol.SU_ADMIN) {
            where.tenantId = usuario.tenantId;
        }

        const packages = await prisma.paqueteAdquirido.findMany({
            where,
            include: {
                TerapiasPsicologos: true
            },
            orderBy: {
                fechaCompra: 'asc'
            }
        });

        return { packages: serializeBigInt(packages) };
    } catch (error) {
        console.error("Error loading packages:", error);
        return { error: "Error al cargar paquetes" };
    }
}

export async function searchClientes(token: string, term: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  if (!term || term.length < 6) {
    return { clientes: [] };
  }

  try {
    const searchWords = term.split(/\s+/).filter(word => word.length > 0);

    const clientes = await prisma.cliente.findMany({
      where: {
        OR: [
          {
            AND: searchWords.map(word => ({
              OR: [
                { nombre: { contains: word, mode: "insensitive" } },
                { apellido: { contains: word, mode: "insensitive" } },
              ]
            }))
          },
          { numeroDocumento: { contains: term, mode: "insensitive" } },
          { telefono: { contains: term, mode: "insensitive" } },
        ],
      },
      take: 15,
      include: {
        direcciones: true,
      }
    });

    return { clientes };

  } catch (error) {
    console.error("Error searching clientes:", error);
    return { error: "Error al buscar clientes" };
  }
}

export async function sendCitaToPsicologo(token: string) {
   const payload = verifyToken(token);
   if (!payload) return { error: "No autorizado" };
 
   try {
     return { success: true, message: "Información enviada al psicólogo" };
   } catch {
     return { error: "Error al enviar información" };
   }
}

export async function getAllCitasForExport(token: string, filters: {
    term?: string;
    empresaId?: string;
    psicologoId?: string;
    consultorioId?: string;
    paqueteId?: string;
    estadoCita?: EstadoCitaFilter;
    estadoPago?: EstadoPagoOrden | "all";
    startDate?: string;
    endDate?: string;
    tenantId?: string;
}) {
    const payload = verifyToken(token);
    if (!payload) return { error: "No autorizado" };
    const result = await getCitas(token, 1, 10000, filters);
    return result.ordenes ? { ordenes: result.ordenes } : { error: "Error exportando" };
}

export async function getTenantsList(token: string) {
    const payload = verifyToken(token);
    if (!payload) return { error: "No autorizado" };
    
    const tenants = await prisma.tenant.findMany({ select: { id: true, nombre: true }});
    return { tenants };
}

export async function uploadComprobantePagoCita(
  token: string,
  citaId: number,
  formData: FormData
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const file = formData.get("file") as File;
    if (!file) return { error: "No se ha proporcionado ningún archivo" };

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const fileExt = file.name.split(".").pop();
    const fileName = `comprobante-cita-${citaId}-${Date.now()}.${fileExt}`;
    const filePath = `${usuario.tenantId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("comprobantePagoPsicologos")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      return { error: "Error al subir el archivo a Supabase" };
    }

    const { data: publicUrlData } = supabase.storage
      .from("comprobantePagoPsicologos")
      .getPublicUrl(filePath);

    const citaPrevia = await prisma.citasPsicologos.findFirst({
        where: { id: BigInt(citaId), tenantId: usuario.tenantId },
        select: { comprobantePath: true }
    });

    await prisma.citasPsicologos.update({
      where: { id: BigInt(citaId), tenantId: usuario.tenantId },
      data: { comprobantePath: publicUrlData.publicUrl },
    });

    await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "UPLOAD_FILE",
        entidad: "Cita",
        entidadId: citaId,
        detalles: {
            descripcion: "Comprobante de pago subido",
            archivo: fileName,
            url: publicUrlData.publicUrl,
            antes: citaPrevia ? { archivo: citaPrevia.comprobantePath } : null,
            despues: { archivo: publicUrlData.publicUrl }
        },
    });

    revalidatePath("/dashboard/citas");
    return { success: true, message: "Comprobante subido correctamente" };
  } catch (error) {
    console.error("Error uploading comprobante pago cita:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return { error: `Error al procesar la subida del comprobante: ${errorMessage}` };
  }
}

export async function markCitaAsRealizada(token: string, citaId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    const citaPrevia = await prisma.citasPsicologos.findFirst({
        where: { id: BigInt(citaId), tenantId: usuario?.tenantId },
        select: { realizada: true }
    });

    await prisma.citasPsicologos.update({
      where: { id: BigInt(citaId), tenantId: usuario?.tenantId },
      data: { realizada: true },
    });

    await createAuditLog({
        tenantId: usuario?.tenantId || 0,
        usuarioId: payload.userId,
        accion: "UPDATE",
        entidad: "Cita",
        entidadId: citaId,
        detalles: {
            descripcion: "Cita marcada como realizada",
            antes: citaPrevia,
            despues: { realizada: true }
        },
    });

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/programacion");
    return { success: true, message: "Cita marcada como realizada" };
  } catch (error) {
    console.error("Error updating cita:", error);
    return { error: "Error al actualizar la cita" };
  }
}

export async function markCitaAsProgramada(token: string, citaId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const result = await prisma.$transaction(async (tx) => {
      const cita = await tx.citasPsicologos.findFirst({
        where: { id: BigInt(citaId), tenantId: usuario.tenantId },
        include: { consultorios: { select: { nombre: true } } },
      });

      if (!cita) return { error: "Cita no encontrada" };
      if (cita.realizada === false) return { error: "La cita ya esta pendiente" };
      if (cita.realizada === null) {
        return { error: "Use restaurar para volver una cita cancelada a pendiente" };
      }

      if (cita.consultorioId && cita.horaInicio && cita.horaFin) {
        const overlappingCita = await tx.citasPsicologos.findFirst({
          where: {
            id: { not: cita.id },
            tenantId: usuario.tenantId,
            consultorioId: cita.consultorioId,
            realizada: false,
            AND: [
              { horaInicio: { lt: cita.horaFin } },
              { horaFin: { gt: cita.horaInicio } },
            ],
          },
          include: { consultorios: { select: { nombre: true } } },
        });

        if (overlappingCita) {
          return {
            error: `No se puede poner pendiente: el consultorio ${overlappingCita.consultorios?.nombre || cita.consultorios?.nombre || ""} ya esta ocupado en ese horario`,
          };
        }
      }

      const updatedCita = await tx.citasPsicologos.updateMany({
        where: {
          id: cita.id,
          tenantId: usuario.tenantId,
          realizada: true,
        },
        data: { realizada: false },
      });

      if (updatedCita.count === 0) {
        return { error: "La cita ya cambio de estado" };
      }

      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "UPDATE",
        entidad: "Cita",
        entidadId: citaId,
        detalles: {
          descripcion: "Cita marcada como pendiente",
          antes: { realizada: true },
          despues: { realizada: false },
        },
        tx,
      });

      return { success: true, message: "Cita marcada como pendiente" };
    });

    if ("error" in result) return result;

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/programacion");
    return { success: true, message: "Cita marcada como pendiente" };
  } catch (error) {
    console.error("Error updating cita to pending:", error);
    return { error: "Error al poner la cita como pendiente" };
  }
}

export async function markCitaAsCancelada(token: string, citaId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const cita = await prisma.citasPsicologos.findFirst({
        where: { id: BigInt(citaId), tenantId: usuario.tenantId },
        include: { PaqueteAdquirido: true }
    });

    if (!cita) return { error: "Cita no encontrada" };
    if (cita.realizada === null) {
      return { error: "La cita ya esta cancelada" };
    }
    await prisma.$transaction(async (tx) => {
      // 1. Mark as cancelled (realizada = null)
      const cancelledCita = await tx.citasPsicologos.updateMany({
        where: {
          id: BigInt(citaId),
          tenantId: usuario.tenantId,
          realizada: cita.realizada,
        },
        data: { realizada: null },
      });

      if (cancelledCita.count === 0) {
        throw new Error("La cita ya no está programada");
      }

      // 2. If it has a package, restore the session
      if (cita.paqueteId) {
        await restorePackageSession(tx, cita.paqueteId);
      }

      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "UPDATE",
        entidad: "Cita",
        entidadId: citaId,
        detalles: {
            descripcion: "Cita marcada como cancelada",
            antes: { realizada: cita.realizada },
            despues: { realizada: null }
        },
        tx
      });
    });

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/programacion");
    return { success: true, message: "Cita marcada como cancelada y sesión restaurada" };
  } catch (error) {
    console.error("Error cancelling cita:", error);
    if (error instanceof Error && error.message === "La cita ya no está programada") {
      return { error: "La cita ya no está programada" };
    }
    return { error: "Error al cancelar la cita" };
  }
}

export async function restoreCitaCancelada(token: string, citaId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const result = await prisma.$transaction(async (tx) => {
      const cita = await tx.citasPsicologos.findFirst({
        where: { id: BigInt(citaId), tenantId: usuario.tenantId },
        include: { consultorios: { select: { nombre: true } } },
      });

      if (!cita) return { error: "Cita no encontrada" };
      if (cita.realizada !== null) {
        return { error: "Solo se pueden restaurar citas canceladas" };
      }

      // Las citas canceladas no reservan el consultorio. Antes de restaurarla,
      // verificamos que nadie haya ocupado el mismo horario.
      if (cita.consultorioId && cita.horaInicio && cita.horaFin) {
        const overlappingCita = await tx.citasPsicologos.findFirst({
          where: {
            id: { not: cita.id },
            tenantId: usuario.tenantId,
            consultorioId: cita.consultorioId,
            realizada: false,
            AND: [
              { horaInicio: { lt: cita.horaFin } },
              { horaFin: { gt: cita.horaInicio } },
            ],
          },
          include: { consultorios: { select: { nombre: true } } },
        });

        if (overlappingCita) {
          return {
            error: `No se puede restaurar: el consultorio ${overlappingCita.consultorios?.nombre || cita.consultorios?.nombre || ""} ya está ocupado en ese horario`,
          };
        }
      }

      // Condicionamos la transición desde el estado cancelado para que una solicitud
      // repetida no reserve una segunda sesión.
      const restoredCita = await tx.citasPsicologos.updateMany({
        where: {
          id: cita.id,
          tenantId: usuario.tenantId,
          realizada: null,
        },
        data: { realizada: false },
      });

      if (restoredCita.count === 0) {
        return { error: "La cita ya fue restaurada o cambió de estado" };
      }

      // Al cancelar se devolvió la sesión; al restaurar la cita se reserva de nuevo.
      if (cita.paqueteId) {
        await consumePackageSession(tx, cita.paqueteId);
      }

      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "UPDATE",
        entidad: "Cita",
        entidadId: citaId,
        detalles: {
          descripcion: "Cancelación de cita revertida",
          antes: { realizada: null },
          despues: { realizada: false },
        },
        tx,
      });

      return { success: true, message: "Cita restaurada como programada" };
    });

    if ("error" in result) return result;

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/programacion");
    return { success: true, message: "Cita restaurada como programada" };
  } catch (error) {
    console.error("Error restoring cita:", error);
    if (error instanceof Error && error.message === "El paquete no tiene saldo disponible") {
      return { error: "No se puede restaurar la cita: el paquete ya no tiene sesiones disponibles" };
    }
    return { error: "Error al restaurar la cita" };
  }
}

export async function toggleCitaPago(token: string, citaId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    const cita = await prisma.citasPsicologos.findFirst({
        where: { id: BigInt(citaId), tenantId: usuario?.tenantId },
        select: { estadoPago: true }
    });

    if (!cita) return { error: "Cita no encontrada" };

    const nuevoEstado = cita.estadoPago === EstadoPagoOrden.CONCILIADO 
        ? EstadoPagoOrden.PENDIENTE 
        : EstadoPagoOrden.CONCILIADO;

    await prisma.citasPsicologos.update({
      where: { id: BigInt(citaId), tenantId: usuario?.tenantId },
      data: { estadoPago: nuevoEstado },
    });

    await createAuditLog({
        tenantId: usuario?.tenantId || 0,
        usuarioId: payload.userId,
        accion: "UPDATE",
        entidad: "Cita",
        entidadId: citaId,
        detalles: {
            descripcion: `Estado de pago actualizado a ${nuevoEstado}`,
            antes: { estadoPago: cita.estadoPago },
            despues: { estadoPago: nuevoEstado }
        },
    });

    revalidatePath("/dashboard/citas");
    return { success: true, message: `Pago marcado como ${nuevoEstado === EstadoPagoOrden.CONCILIADO ? 'CONCILIADO' : 'PENDIENTE'}` };
  } catch (error) {
    console.error("Error updating pago:", error);
    return { error: "Error al actualizar el estado de pago" };
  }
}

export async function updateCitaPago(
  token: string, 
  citaId: number, 
  metodoPago: string, 
  estadoPago: EstadoPagoOrden
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    const citaPrevia = await prisma.citasPsicologos.findFirst({
        where: { id: BigInt(citaId), tenantId: usuario?.tenantId },
        select: { metodoPago: true, estadoPago: true }
    });

    if (!citaPrevia) return { error: "Cita no encontrada" };

    await prisma.citasPsicologos.update({
      where: { id: BigInt(citaId), tenantId: usuario?.tenantId },
      data: { 
        metodoPago, 
        estadoPago 
      },
    });

    await createAuditLog({
        tenantId: usuario?.tenantId || 0,
        usuarioId: payload.userId,
        accion: "UPDATE",
        entidad: "Cita",
        entidadId: citaId,
        detalles: {
            descripcion: "Información de pago actualizada",
            antes: citaPrevia,
            despues: { metodoPago, estadoPago }
        },
    });

    revalidatePath("/dashboard/citas");
    return { success: true, message: "Información de pago actualizada correctamente" };
  } catch (error) {
    console.error("Error updating cita pago:", error);
    return { error: "Error al actualizar el pago" };
  }
}

export async function checkConsultorioDisponibilidad(
  token: string, 
  consultorioId: string, 
  fecha: string, 
  horaInicioStr: string, 
  horaFinStr: string,
  excludeCitaId?: number
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const TIMEZONE = "America/Bogota";
    const horaInicio = fromZonedTime(`${fecha}T${horaInicioStr}`, TIMEZONE);
    const horaFin = fromZonedTime(`${fecha}T${horaFinStr}`, TIMEZONE);

    if (horaInicio >= horaFin) {
      return { disponible: false, error: "La hora de inicio debe ser anterior a la hora de fin" };
    }

    const overlappingCita = await prisma.citasPsicologos.findFirst({
      where: {
        ...(excludeCitaId && { id: { not: BigInt(excludeCitaId) } }),
        consultorioId: BigInt(consultorioId),
        tenantId: usuario.tenantId,
        realizada: false,
        AND: [
          { horaInicio: { lt: horaFin } },
          { horaFin: { gt: horaInicio } }
        ]
      },
      include: { consultorios: true }
    });

    if (overlappingCita) {
      return { 
        disponible: false, 
        mensaje: `El consultorio ${overlappingCita.consultorios?.nombre || ""} ya está ocupado en ese horario` 
      };
    }

    return { disponible: true };
  } catch (error) {
    console.error("Error checking disponibilidad:", error);
    return { error: "Error al verificar disponibilidad" };
  }
}

export async function updateCita(token: string, id: number, formData: FormData) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const psicologoId = formData.get("tecnico") ? Number(formData.get("tecnico")) : null;
    const fechaCitaStr = formData.get("fechaVisita") as string;
    const horaInicioStr = formData.get("horaInicio") as string;
    const horaFinStr = formData.get("horaFin") as string;
    const observacion = formData.get("observacion") as string;
    const valor = formData.get("valorCotizado") ? Number(formData.get("valorCotizado")) : null;
    const metodoPago = formData.get("metodoPago") ? formData.get("metodoPago")?.toString() : null;
    const consultorioIdRaw = formData.get("consultorioId");
    const consultorioId = consultorioIdRaw ? BigInt(consultorioIdRaw.toString()) : null;

    const terapiaIdRaw = formData.get("terapiaId");
    const terapiaId = terapiaIdRaw ? BigInt(terapiaIdRaw.toString()) : null;

    const TIMEZONE = "America/Bogota";
    let fechaCita: Date | null = null;
    let horaInicio: Date | null = null;
    let horaFin: Date | null = null;

    if (fechaCitaStr) {
      fechaCita = fromZonedTime(`${fechaCitaStr}T00:00`, TIMEZONE);
    }
    if (fechaCitaStr && horaInicioStr) {
      horaInicio = fromZonedTime(`${fechaCitaStr}T${horaInicioStr}`, TIMEZONE);
    }
    if (fechaCitaStr && horaFinStr) {
      horaFin = fromZonedTime(`${fechaCitaStr}T${horaFinStr}`, TIMEZONE);
    }

    if (consultorioId && horaInicio && horaFin) {
      if (horaInicio >= horaFin) {
        return { error: "La hora de inicio debe ser anterior a la hora de fin" };
      }

      const overlappingCita = await prisma.citasPsicologos.findFirst({
        where: {
          id: { not: BigInt(id) },
          consultorioId,
          tenantId: usuario.tenantId,
          realizada: false,
          AND: [
            { horaInicio: { lt: horaFin } },
            { horaFin: { gt: horaInicio } }
          ]
        },
        include: { consultorios: true }
      });

      if (overlappingCita) {
        return { error: `El consultorio ${overlappingCita.consultorios?.nombre || ""} ya está ocupado en ese horario` };
      }
    }

    await prisma.$transaction(async (tx) => {
        let newPaqueteId: bigint | undefined = undefined;
        let oldPaqueteId: bigint | null | undefined = undefined;
        let citaPrevia = null;

        const currentCita = await tx.citasPsicologos.findUnique({
            where: { id: BigInt(id), tenantId: usuario.tenantId },
            include: { PaqueteAdquirido: true } // Include package to get details if needed
        });
        
        if (currentCita) {
            citaPrevia = serializeBigInt(currentCita);
            oldPaqueteId = currentCita.paqueteId;

            if (terapiaId) {
                const currentCatalogoId = currentCita.PaqueteAdquirido?.catalogoId;

                if (currentCatalogoId !== terapiaId) {
                    const paqueteUsuarioId = currentCita.pacienteId
                        ? null
                        : (psicologoId ?? currentCita.psicologoId);

                    newPaqueteId = await resolvePackageForScheduledCita(tx, {
                        tenantId: usuario.tenantId,
                        pacienteId: currentCita.pacienteId,
                        psicologoId: paqueteUsuarioId,
                        terapiaId,
                        valor,
                        excludePackageId: oldPaqueteId,
                    });
                }
            }
        }

        const citaActualizada = await tx.citasPsicologos.update({
          where: { id: BigInt(id), tenantId: usuario.tenantId },
          data: {
            psicologoId,
            fechaCita,
            horaInicio,
            horaFin,
            valor,
            observacion,
            metodoPago,
            consultorioId,
            ...(newPaqueteId && { paqueteId: newPaqueteId })
          },
        });

        // Cleanup Old Package
        if (newPaqueteId && oldPaqueteId && newPaqueteId !== oldPaqueteId) {
             const otherCitasCount = await tx.citasPsicologos.count({
                 where: { 
                     paqueteId: oldPaqueteId,
                     id: { not: BigInt(id) }
                 }
             });

             if (otherCitasCount === 0) {
                 await tx.paqueteAdquirido.delete({
                     where: { id: oldPaqueteId }
                 });
             } else {
                 await tx.paqueteAdquirido.update({
                     where: { id: oldPaqueteId },
                     data: {
                         sesionesConsumidas: { decrement: 1 },
                         saldoRestante: { increment: 1 }
                     }
                 });
             }
        }

        await createAuditLog({
            tenantId: usuario.tenantId,
            usuarioId: payload.userId,
            accion: "UPDATE",
            entidad: "Cita",
            entidadId: id,
            detalles: {
                descripcion: "Cita actualizada",
                antes: citaPrevia,
                despues: serializeBigInt(citaActualizada),
            },
            tx
        });
    });

    revalidatePath("/dashboard/citas");
    return { success: true, message: "Cita actualizada correctamente" };
  } catch (error) {
    console.error("Error actualizando cita:", error);
    return { error: "Error al actualizar la cita" };
  }
}

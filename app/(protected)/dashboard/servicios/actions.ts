"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import { redis } from "@/lib/redis";
import { sendPushNotification } from "@/lib/notifications";
import { createClient } from "@supabase/supabase-js";
import { Prisma, Direccion } from "@/prisma/generated/prisma/client";
import { fromZonedTime } from "date-fns-tz";
import { serializeData } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import { municipiosAntioquia } from "@/lib/constants/municipios";
import { addDays, addMonths } from "date-fns";

interface AddressData {
  direccion: string;
  municipio?: string | null;
  barrio?: string | null;
  bloque?: string | null;
  unidad?: string | null;
  piso?: string | null;
  linkMaps?: string | null;
}

interface VehicleData {
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  tipo?: string | null;
}

// --- Funciones para el Listado de Órdenes (Page principal) ---

export async function getOrdenesServicio(
  token: string,
  page: number = 1,
  limit: number = 10,
  filters: {
    term?: string;
    empresaId?: string;
    tipoServicioId?: string;
    creadorId?: string;
    tecnicoId?: string;
    metodoPagoId?: string;
    estado?: string;
    startDate?: string;
    endDate?: string;
    municipio?: string;
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

    const where: Prisma.OrdenServicioWhereInput = usuario.rol === "SU_ADMIN" ? {} : { tenantId: usuario.tenantId };

    // Filtro por término de búsqueda (nombre, documento, teléfono)
    if (filters.term) {
      const term = filters.term;
      const searchWords = term.split(/\s+/).filter(word => word.length > 0);

      where.OR = [
        {
          cliente: {
            AND: searchWords.map(word => ({
              OR: [
                { nombre: { contains: word, mode: "insensitive" } },
                { apellido: { contains: word, mode: "insensitive" } },
              ]
            }))
          }
        },
        { cliente: { numeroDocumento: { contains: term, mode: "insensitive" } } },
        { cliente: { telefono: { contains: term, mode: "insensitive" } } },
        { cliente: { telefono2: { contains: term, mode: "insensitive" } } },
        { numeroOrden: { contains: term, mode: "insensitive" } },
      ];
    }

    // Filtros específicos
    if (filters.empresaId && filters.empresaId !== "all") {
      where.empresaId = Number(filters.empresaId);
    }

    if (filters.tipoServicioId && filters.tipoServicioId !== "all") {
      where.tipoServicioId = Number(filters.tipoServicioId);
    }

    if (filters.creadorId && filters.creadorId !== "all") {
      where.creadoPorId = Number(filters.creadorId);
    }

    if (filters.tecnicoId && filters.tecnicoId !== "all") {
      if (filters.tecnicoId === "unassigned") {
        where.tecnicoId = null;
      } else {
        where.tecnicoId = Number(filters.tecnicoId);
      }
    }

    if (filters.metodoPagoId && filters.metodoPagoId !== "all") {
      where.metodoPagoId = Number(filters.metodoPagoId);
    }

    if (filters.municipio && filters.municipio !== "all") {
      where.municipio = filters.municipio;
    }

    // Filtro de Estado (Mapeo de lógica de negocio a consulta DB)
    if (filters.estado && filters.estado !== "all") {
      const estado = filters.estado;

      // Check if it's a comma-separated list of IDs
      if (estado.includes(",")) {
        const estadoIds = estado.split(",").map(Number).filter(n => !isNaN(n));
        if (estadoIds.length > 0) {
          where.estadoServicioId = { in: estadoIds };
        }
      }
      // Si el filtro es un ID numérico único
      else if (!isNaN(Number(estado))) {
        where.estadoServicioId = Number(estado);
      } 
      // Lógica para grupos de estados o claves de texto antiguas
      else if (estado === "SERVICIO_NUEVO") {
        where.estadoServicio = { nombre: { contains: "nuevo", mode: "insensitive" } };
      } else if (estado === "PROGRAMADO") {
        where.estadoServicio = {
          OR: [
            { nombre: { contains: "Agendado", mode: "insensitive" } },
            { nombre: { contains: "Programado", mode: "insensitive" } },
            { nombre: { contains: "Reprogramado", mode: "insensitive" } },
          ],
        };
      } else if (estado === "EN_PROCESO") {
        where.estadoServicio = { nombre: { contains: "proceso", mode: "insensitive" } };
      } else if (estado === "SERVICIO_LISTO") {
        where.estadoServicio = {
          OR: [
            { nombre: { contains: "finalizado", mode: "insensitive" } },
            { nombre: { contains: "listo", mode: "insensitive" } },
          ],
        };
      } else if (estado === "CANCELADO") {
         where.estadoServicio = { nombre: { contains: "cancelado", mode: "insensitive" } };
      }
    }

    // Filtro de Fechas
    if (filters.startDate || filters.endDate) {
      where.fechaVisita = {};
      const TIMEZONE = "America/Bogota";
      if (filters.startDate) {
        where.fechaVisita.gte = fromZonedTime(`${filters.startDate}T00:00:00`, TIMEZONE);
      }
      if (filters.endDate) {
        where.fechaVisita.lte = fromZonedTime(`${filters.endDate}T23:59:59.999`, TIMEZONE);
      }
    }

    // Calcular paginación
    const skip = (page - 1) * limit;

    let orderBy: Prisma.OrdenServicioOrderByWithRelationInput | Prisma.OrdenServicioOrderByWithRelationInput[] = { id: "desc" };

    if (filters.startDate || filters.endDate) {
      orderBy = [
        { fechaVisita: "asc" },
        { horaInicio: "asc" }
      ];
    }

    // Ejecutar consultas en paralelo (conteo y datos)
    const [total, ordenes] = await Promise.all([
      prisma.ordenServicio.count({ where }),
      prisma.ordenServicio.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          cliente: {
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
          empresa: { select: { id: true, nombre: true } },
          servicio: { select: { nombre: true } },
          tecnico: { select: { nombre: true, apellido: true } },
          tipoServicio: { select: { id: true, nombre: true } },
          creadoPor: { select: { nombre: true, apellido: true } },
          zona: { select: { nombre: true } },
          estadoServicio: { select: { id: true, nombre: true } },
          metodoPago: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    const mapEstado = (nombre: string) => {
      const n = nombre.toLowerCase();
      if (n.includes("nuevo")) return "SERVICIO_NUEVO";
      if (
        n.includes("agendado") ||
        n.includes("reprogramado") ||
        n.includes("programado")
      )
        return "PROGRAMADO";
      if (n.includes("proceso")) return "EN_PROCESO";
      if (n.includes("finalizado") || n.includes("listo"))
        return "SERVICIO_LISTO";
      if (n.includes("cancelado")) return "CANCELADO";
      return nombre;
    };

    const ordenesSerialized = ordenes.map((orden) => {
      const s = serializeData(orden) as Record<string, unknown>;
      return {
        ...s,
        estado: mapEstado(orden.estadoServicio.nombre),
      };
    });

    return { ordenes: ordenesSerialized, total, totalPages: Math.ceil(total / limit) };
  } catch (error) {
    console.error("Error obteniendo órdenes:", error);
    return { error: "Error al cargar las órdenes" };
  }
}

export async function getOrdenServicio(token: string, id: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const orden = await prisma.ordenServicio.findUnique({
      where: { id, tenantId: usuario.tenantId },
      include: {
        cliente: true,
        empresa: true,
        servicio: true,
        tecnico: true,
        direccion: true,
        vehiculo: true,
        tipoServicio: true,
        zona: true,
        metodoPago: true,
        creadoPor: true,
        estadoServicio: true,
        geolocalizaciones: true,
      },
    });

    if (!orden) return { error: "Orden no encontrada" };

    const mapEstado = (nombre: string) => {
      const n = nombre.toLowerCase();
      if (n.includes("nuevo")) return "SERVICIO_NUEVO";
      if (
        n.includes("agendado") ||
        n.includes("reprogramado") ||
        n.includes("programado")
      )
        return "PROGRAMADO";
      if (n.includes("proceso")) return "EN_PROCESO";
      if (n.includes("finalizado") || n.includes("listo"))
        return "SERVICIO_LISTO";
      if (n.includes("cancelado")) return "CANCELADO";
      return nombre;
    };

    const s = serializeData(orden) as Record<string, unknown>;
    const ordenSerialized = {
      ...s,
      estado: mapEstado(orden.estadoServicio.nombre),
    };

    return { orden: ordenSerialized };
  } catch (error) {
    console.error("Error obteniendo orden:", error);
    return { error: "Error al cargar la orden" };
  }
}

export async function deleteOrdenServicio(token: string, id: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const orden = await prisma.ordenServicio.findUnique({
      where: { id, tenantId: usuario.tenantId },
    });

    if (!orden) return { error: "Orden no encontrada" };

    await prisma.$transaction(async (tx) => {
      // 1. Eliminar Geolocalizaciones asociadas
      await tx.geolocalizacion.deleteMany({
        where: { ordenId: id, tenantId: usuario.tenantId },
      });

      // 2. Eliminar detalles de nómina asociados (si existen)
      await tx.nominaDetalle.deleteMany({
        where: { ordenId: id },
      });

      // 3. Desvincular órdenes hijas (si es padre)
      await tx.ordenServicio.updateMany({
        where: { ordenPadreId: id, tenantId: usuario.tenantId },
        data: { ordenPadreId: null },
      });

      // 4. Finalmente eliminar la orden
      await tx.ordenServicio.delete({
        where: { id, tenantId: usuario.tenantId },
      });

      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "DELETE",
        entidad: "OrdenServicio",
        entidadId: id,
        detalles: {
          descripcion: "Orden de servicio eliminada",
          antes: orden,
        },
        tx,
      });
    });

    if (redis) {
      await redis.del(`stats:ordenes:${usuario.tenantId}`);
    }

    revalidatePath("/dashboard/servicios");
    return { success: true, message: "Orden eliminada exitosamente" };
  } catch (error) {
    console.error("Error eliminando orden:", error);
    return { error: "Error al eliminar la orden" };
  }
}

export async function getOrdenesStats(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const isSuAdmin = usuario.rol === "SU_ADMIN";
    const tenantId = usuario.tenantId;
    const redisKey = isSuAdmin ? `stats:ordenes:all` : `stats:ordenes:${tenantId}`;

    if (redis) {
      const cachedStats = await redis.get(redisKey);
      if (cachedStats) {
        return { stats: JSON.parse(cachedStats) };
      }
    }

    const where: Prisma.OrdenServicioWhereInput = isSuAdmin ? {} : { tenantId };

    // Fetch states to map names
    const estados = await prisma.estadoServicio.findMany({
      where: isSuAdmin ? {} : { tenantId },
    });

    // Usar una sola consulta agregada en lugar de 5 consultas separadas
    const [stats, noConcretados] = await Promise.all([
      prisma.ordenServicio.groupBy({
        by: ["estadoServicioId"],
        where,
        _count: true,
      }),
      prisma.ordenServicio.count({
        where: {
          ...where,
          estadoServicio: {
            nombre: "No Concretado", // Using name check via relation
          },
        },
      }),
    ]);

    // Contar desde los resultados agrupados
    const totalOrdenes = stats.reduce((sum, s) => sum + s._count, 0);

    const getCountByStateName = (nameFragment: string) => {
      const stateIds = estados
        .filter((e) =>
          e.nombre.toLowerCase().includes(nameFragment.toLowerCase()),
        )
        .map((e) => e.id);
      return stats
        .filter((s) => stateIds.includes(s.estadoServicioId))
        .reduce((sum, s) => sum + s._count, 0);
    };

    const programadas =
      getCountByStateName("Programado") + getCountByStateName("Agendado");
    const enProceso = getCountByStateName("En Proceso");
    const finalizadas =
      getCountByStateName("Finalizado") + getCountByStateName("Listo");

    const resultStats = {
      totalOrdenes,
      programadas,
      enProceso,
      finalizadas,
      noConcretados,
    };

    if (redis) {
      await redis.set(
        redisKey,
        JSON.stringify(resultStats),
        "EX",
        300,
      );
    }

    return {
      stats: resultStats,
    };
  } catch (error) {
    console.error("Error stats:", error);
    return { error: "Error cargando estadísticas" };
  }
}

// --- Funciones para Nuevo Servicio (Formulario) ---

// NUEVA FUNCIÓN OPTIMIZADA SOLO PARA FILTROS
export async function getFilterData(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };
    
    const isSuAdmin = usuario.rol === "SU_ADMIN";
    const tenantId = usuario.tenantId;

    const whereBase = isSuAdmin ? {} : { tenantId };
    const whereActive = isSuAdmin ? { activo: true } : { tenantId, activo: true };

    // Solo las consultas necesarias para filtros
    const [tiposServicios, creadores, tecnicos, empresas, estadosServicio, metodosPago] = await Promise.all([
      prisma.tipoServicio.findMany({
        where: whereActive,
        select: { id: true, nombre: true, empresaId: true },
      }),
      prisma.usuario.findMany({
        where: { ...whereActive, rol: { in: ["SU_ADMIN", "ADMIN", "ASESOR"] } },
        select: { id: true, nombre: true, apellido: true },
      }),
      prisma.usuario.findMany({
        where: { ...whereActive, rol: "TECNICO" },
        select: { id: true, nombre: true, apellido: true },
      }),
      prisma.empresa.findMany({
        where: whereBase,
        select: { id: true, nombre: true },
      }),
      prisma.estadoServicio.findMany({
        where: whereActive,
        select: { id: true, nombre: true, empresaId: true },
      }),
      prisma.metodoPago.findMany({
        where: whereActive,
        select: { id: true, nombre: true, empresaId: true },
      }),
    ]);

    const municipios = municipiosAntioquia.map(m => m.nombre).sort();

    return {
      tiposServicios,
      creadores,
      tecnicos,
      empresas,
      estadosServicio,
      metodosPago,
      municipios,
      error: null as string | null
    };
  } catch (error) {
    console.error("Error getFilterData:", error);
    return {
      tiposServicios: [],
      creadores: [],
      tecnicos: [],
      empresas: [],
      estadosServicio: [],
      metodosPago: [],
      municipios: [],
      error: "Error al cargar datos de filtros"
    };
  }
}

export async function getFormData(token: string, simpleMode: boolean = false) {
  noStore();
  console.error(">>> [ACTION] getFormData START (Cache Bypassed)");
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };
    
    const tenantId = usuario.tenantId;

    const whereBase = { tenantId };
    const whereActive = { tenantId, activo: true };
    const whereEstado = { tenantId, estado: true };

    const [
      tiposServicios,
      servicios,
      tecnicosRaw,
      asesores,
      creadores,
      empresas,
      zonas,
      metodosPago,
      estadosServicio,
      picoPlacaRule
    ] = await Promise.all([
      prisma.tipoServicio.findMany({ where: whereActive }),
      !simpleMode
        ? prisma.servicio.findMany({ where: whereActive })
        : Promise.resolve([]),
      !simpleMode
        ? prisma.usuario.findMany({
            where: { ...whereActive, rol: "TECNICO" },
            select: {
              id: true,
              nombre: true,
              apellido: true,
              placa: true,
              moto: true,
              empresaId: true,
            },
          })
        : Promise.resolve([]),
      !simpleMode
        ? prisma.usuario.findMany({
            where: { ...whereActive, rol: "ASESOR" },
            select: { id: true, nombre: true, apellido: true, empresaId: true },
          })
        : Promise.resolve([]),
      prisma.usuario.findMany({
        where: { ...whereActive, rol: { in: ["SU_ADMIN", "ADMIN", "ASESOR"] } },
        select: { id: true, nombre: true, apellido: true },
      }),
      prisma.empresa.findMany({ where: whereBase }),
      !simpleMode
        ? prisma.zona.findMany({ where: whereEstado })
        : Promise.resolve([]),
      !simpleMode
        ? prisma.metodoPago.findMany({ where: whereActive })
        : Promise.resolve([]),
      !simpleMode
        ? (async () => {
            const result = await prisma.estadoServicio.findMany({
              where: whereActive,
            });
            console.error(`[DEBUG-STATES] Tenant: ${tenantId} | States found: ${result.length}`);
            return result;
          })()
        : Promise.resolve([]),
      !simpleMode 
        ? (async () => {
             const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
             const todayName = days[new Date().getDay()];
             return prisma.picoPlaca.findFirst({
                 where: { tenantId, dia: todayName, activo: true }
             });
          })()
        : Promise.resolve(null)
    ]);

    // Filtrar técnicos con Pico y Placa HOY
    let tecnicos = tecnicosRaw;
    if (picoPlacaRule && (picoPlacaRule.numeroUno !== null || picoPlacaRule.numeroDos !== null)) {
         tecnicos = tecnicosRaw.filter(t => {
             if (!t.placa) return true; // Si no tiene placa, asumimos que puede circular o no aplica
             
             const isMoto = t.moto === true;
             const placaLimpia = t.placa.trim().toUpperCase();
             const digitosPlaca = placaLimpia.replace(/\D/g, '');
             
             if (digitosPlaca.length === 0) return true;

             let digitoComparar = -1;
             if (isMoto) {
                 digitoComparar = parseInt(digitosPlaca[0]);
             } else {
                 digitoComparar = parseInt(digitosPlaca[digitosPlaca.length - 1]);
             }

             // Si coincide con restringido, LO SACAMOS (return false)
             if (picoPlacaRule.numeroUno !== null && digitoComparar === picoPlacaRule.numeroUno) return false;
             if (picoPlacaRule.numeroDos !== null && digitoComparar === picoPlacaRule.numeroDos) return false;
             
             return true;
         });
    }

    return {
      clientes: [], // Return empty array, clients will be searched dynamically
      tiposServicios,
      servicios,
      tecnicos,
      asesores,
      creadores,
      empresas,
      zonas,
      metodosPago,
      estadosServicio,
    };
  } catch (error) {
    console.error("Error getFormData:", error);
    return { error: "Error al cargar datos del formulario" };
  }
}

export async function addDireccionToCliente(
  token: string,
  clienteId: number,
  addressData: AddressData,
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    // Validar municipio si se proporciona
    if (addressData.municipio) {
      const existe = municipiosAntioquia.some(m => m.nombre === addressData.municipio);
      if (!existe) {
        console.warn(`Municipio no reconocido: ${addressData.municipio}`);
        // Podríamos normalizar o lanzar error, por ahora solo advertimos o dejamos pasar si es intencional
      }
    }

    const nuevaDireccion = await prisma.direccion.create({
      data: {
        tenantId: usuario.tenantId,
        clienteId,
        direccion: addressData.direccion,
        municipio: addressData.municipio,
        barrio: addressData.barrio,
        bloque: addressData.bloque,
        unidad: addressData.unidad,
        piso: addressData.piso,
        linkMaps: addressData.linkMaps,
      },
    });

    return { direccion: nuevaDireccion };
  } catch (error) {
    console.error("Error adding address:", error);
    return { error: "Error al guardar la dirección" };
  }
}

export async function addVehiculoToCliente(
  token: string,
  clienteId: number,
  vehicleData: VehicleData,
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const nuevoVehiculo = await prisma.vehiculo.create({
      data: {
        tenantId: usuario.tenantId,
        clienteId,
        placa: vehicleData.placa,
        marca: vehicleData.marca,
        modelo: vehicleData.modelo,
        color: vehicleData.color,
        tipo: vehicleData.tipo,
      },
    });

    return { vehiculo: nuevoVehiculo };
  } catch (error) {
    console.error("Error adding vehicle:", error);
    return { error: "Error al guardar el vehículo" };
  }
}

export async function createOrdenServicio(token: string, formData: FormData) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, id: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const clienteId = Number(formData.get("cliente"));
    const direccionId = formData.get("direccionCliente") ? Number(formData.get("direccionCliente")) : null;
    const vehiculoId = formData.get("vehiculoCliente") ? Number(formData.get("vehiculoCliente")) : null;
    const empresaId = Number(formData.get("empresa"));
    const tipoServicioId = Number(formData.get("tipoServicio"));
    const servicioId = Number(formData.get("servicio"));
    const tecnicoId = formData.get("tecnico") ? Number(formData.get("tecnico")) : null;
    const zonaId = formData.get("zona") ? Number(formData.get("zona")) : null;

    const observacion = formData.get("observacion") as string;
    const observacionFinal = formData.get("observacionFinal") as string;
    let linkMaps = formData.get("linkMaps") as string;

    const fechaVisitaStr = formData.get("fechaVisita") as string;
    const horaInicioStr = formData.get("horaInicio") as string;

    console.log("DEBUG: createOrdenServicio inputs:", { fechaVisitaStr, horaInicioStr });

    const valorCotizado = formData.get("valorCotizado")
      ? Number(formData.get("valorCotizado"))
      : null;
    const valorPagado = formData.get("valorPagado")
      ? Number(formData.get("valorPagado"))
      : null;
    const valorRepuestos = formData.get("valorRepuestos")
      ? Number(formData.get("valorRepuestos"))
      : 0;
    const metodoPagoId = formData.get("metodoPago")
      ? Number(formData.get("metodoPago"))
      : null;
    const estadoServicioId = formData.get("estado")
      ? Number(formData.get("estado"))
      : null;

    // Validate required fields
    if (!clienteId || !servicioId || !tipoServicioId || !estadoServicioId) {
      return { error: "Faltan campos obligatorios" };
    }
    
    if (!direccionId && !vehiculoId) {
        return { error: "Debe seleccionar una dirección o un vehículo." };
    }

    // Get address text for caching
    let direccionTexto = "Dirección no encontrada";
    let direccion: Direccion | null = null;
    
    if (direccionId) {
        direccion = await prisma.direccion.findUnique({
            where: { id: direccionId },
        });
        direccionTexto = direccion
            ? `${direccion.direccion} ${direccion.municipio || ""}`.trim()
            : "Dirección no encontrada";
        
        if (!linkMaps && direccion?.linkMaps) {
            linkMaps = direccion.linkMaps;
        }
    } else if (vehiculoId) {
        const vehiculo = await prisma.vehiculo.findUnique({
             where: { id: vehiculoId },
        });
        direccionTexto = vehiculo ? `Vehículo: ${vehiculo.placa} - ${vehiculo.marca || ''}` : "Vehículo no encontrado";
    }


    // Combine Date and Time
    let fechaVisita: Date | null = null;
    let horaInicio: Date | null = null;
    const TIMEZONE = "America/Bogota";

    if (fechaVisitaStr) {
      // Create date at 00:00:00 in the specific timezone
      fechaVisita = fromZonedTime(`${fechaVisitaStr}T00:00`, TIMEZONE);
    }

    if (fechaVisitaStr && horaInicioStr) {
      // Create timestamp in the specific timezone
      horaInicio = fromZonedTime(`${fechaVisitaStr}T${horaInicioStr}`, TIMEZONE);
    }

    console.log("DEBUG: createOrdenServicio parsed:", { 
      fechaVisita: fechaVisita?.toISOString(), 
      horaInicio: horaInicio?.toISOString(),
      timezone: TIMEZONE 
    });

    const nuevaOrden = await prisma.ordenServicio.create({
      data: {
        tenantId: usuario.tenantId,
        clienteId,
        direccionId,
        vehiculoId,
        empresaId,
        tipoServicioId,
        servicioId,
        tecnicoId,
        zonaId,
        observacion,
        observacionFinal,
        linkMaps,
        fechaVisita,
        horaInicio,
        valorCotizado,
        valorPagado,
        valorRepuestos,
        metodoPagoId,
        estadoServicioId,
        direccionTexto,
        creadoPorId: usuario.id,
        barrio: direccion?.barrio,
        municipio: direccion?.municipio,
        bloque: direccion?.bloque,
        unidad: direccion?.unidad,
        piso: direccion?.piso,
      },
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "CREATE",
      entidad: "OrdenServicio",
      entidadId: nuevaOrden.id,
      detalles: {
        descripcion: "Orden de servicio creada",
        despues: nuevaOrden,
      },
    });

    if (tecnicoId) {
      await sendPushNotification(
        tecnicoId,
        "¡Nuevo servicio asignado! 🐜",
        `Tienes un nuevo servicio en ${direccionTexto}.`,
        { serviceId: nuevaOrden.id }
      );
    }

    revalidatePath("/dashboard/servicios");

    if (redis) {
      await redis.del(`stats:ordenes:${usuario.tenantId}`);
    }

    // --- AUTOMATIC FOLLOW-UPS ---
    // Only for Tenant 1 (Pest Control) and not for Refuerzos themselves (tipoServicioId 3)
    if (usuario.tenantId === 1 && tipoServicioId !== 3 && fechaVisita) {
      try {
        const intervalDays = servicioId === 3 ? 7 : 14;
        const dateFollowUp1 = addDays(fechaVisita, intervalDays);
        const dateFollowUp2 = addMonths(fechaVisita, 3);

        const estadoAgendado = await prisma.estadoServicio.findFirst({
          where: {
            tenantId: usuario.tenantId,
            nombre: { contains: "Agendado", mode: "insensitive" },
            activo: true,
          },
        }) || await prisma.estadoServicio.findFirst({
          where: { tenantId: usuario.tenantId, activo: true }
        });

        const estadoId = estadoAgendado?.id || estadoServicioId;

        // Create Follow-up 1 (7/14 days) - Marked as Refuerzo (3)
        await prisma.ordenServicio.create({
          data: {
            tenantId: usuario.tenantId,
            clienteId,
            direccionId,
            vehiculoId,
            empresaId,
            tipoServicioId: 3,
            servicioId,
            tecnicoId: null,
            fechaVisita: dateFollowUp1,
            horaInicio: dateFollowUp1,
            estadoServicioId: estadoId,
            direccionTexto,
            creadoPorId: usuario.id,
            ordenPadreId: nuevaOrden.id,
            observacion: `Refuerzo automático (${intervalDays} días) de orden #${nuevaOrden.id}`,
            municipio: direccion?.municipio || null,
            barrio: direccion?.barrio || null,
            piso: direccion?.piso || null,
            bloque: direccion?.bloque || null,
            unidad: direccion?.unidad || null,
          }
        });

        // Create Follow-up 2 (3 months)
        await prisma.ordenServicio.create({
          data: {
            tenantId: usuario.tenantId,
            clienteId,
            direccionId,
            vehiculoId,
            empresaId,
            tipoServicioId: 3,
            servicioId,
            tecnicoId: null,
            fechaVisita: dateFollowUp2,
            horaInicio: dateFollowUp2,
            estadoServicioId: estadoId,
            direccionTexto,
            creadoPorId: usuario.id,
            ordenPadreId: nuevaOrden.id,
            observacion: `Seguimiento automático (3 meses) de orden #${nuevaOrden.id}`,
            municipio: direccion?.municipio || null,
            barrio: direccion?.barrio || null,
            piso: direccion?.piso || null,
            bloque: direccion?.bloque || null,
            unidad: direccion?.unidad || null,
          }
        });
      } catch (err) {
        console.error("Error creating automatic follow-ups:", err);
      }
    }

    return { success: true, message: "Orden de servicio creada correctamente" };
  } catch (error) {
    console.error("Error creating orden:", error);
    return { error: "Error al crear la orden de servicio" };
  }
}

export async function updateOrdenServicio(
  token: string,
  id: number,
  formData: FormData,
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    // Verify existence and ownership
    const existingOrden = await prisma.ordenServicio.findUnique({
      where: { id, tenantId: usuario.tenantId },
    });

    if (!existingOrden) return { error: "Orden no encontrada" };

    // Extract data
    const clienteId = Number(formData.get("cliente"));
    const direccionId = formData.get("direccionCliente") ? Number(formData.get("direccionCliente")) : null;
    const vehiculoId = formData.get("vehiculoCliente") ? Number(formData.get("vehiculoCliente")) : null;
    const empresaId = Number(formData.get("empresa"));
    const tipoServicioId = Number(formData.get("tipoServicio"));
    const servicioId = Number(formData.get("servicio"));
    const tecnicoId = formData.get("tecnico")
      ? Number(formData.get("tecnico"))
      : null;
    const zonaId = formData.get("zona") ? Number(formData.get("zona")) : null;
    const observacion = formData.get("observacion") as string;
    const observacionFinal = formData.get("observacionFinal") as string;
    let linkMaps = formData.get("linkMaps") as string;

    const fechaVisitaStr = formData.get("fechaVisita") as string;
    const horaInicioStr = formData.get("horaInicio") as string;

    console.log("DEBUG: updateOrdenServicio inputs:", { fechaVisitaStr, horaInicioStr });

    const valorCotizado = formData.get("valorCotizado")
      ? Number(formData.get("valorCotizado"))
      : null;
    const valorPagado = formData.get("valorPagado")
      ? Number(formData.get("valorPagado"))
      : null;
    const valorRepuestos = formData.get("valorRepuestos")
      ? Number(formData.get("valorRepuestos"))
      : 0;
    const metodoPagoId = formData.get("metodoPago")
      ? Number(formData.get("metodoPago"))
      : null;
    const estadoServicioId = formData.get("estado")
      ? Number(formData.get("estado"))
      : null;

    // Validate required fields
    if (!clienteId || !servicioId || !tipoServicioId || !estadoServicioId) {
      return { error: "Faltan campos obligatorios" };
    }
    
    if (!direccionId && !vehiculoId) {
        return { error: "Debe seleccionar una dirección o un vehículo." };
    }

    // Get address text for caching
    let direccionTexto = "Dirección no encontrada";
    let direccion: Direccion | null = null;
    
    if (direccionId) {
        direccion = await prisma.direccion.findUnique({
            where: { id: direccionId },
        });
        direccionTexto = direccion
            ? `${direccion.direccion} ${direccion.municipio || ""}`.trim()
            : "Dirección no encontrada";
        
        if (!linkMaps && direccion?.linkMaps) {
            linkMaps = direccion.linkMaps;
        }
    } else if (vehiculoId) {
        const vehiculo = await prisma.vehiculo.findUnique({
             where: { id: vehiculoId },
        });
        direccionTexto = vehiculo ? `Vehículo: ${vehiculo.placa} - ${vehiculo.marca || ''}` : "Vehículo no encontrado";
    }

    // Combine Date and Time
    let fechaVisita: Date | null = null;
    let horaInicio: Date | null = null;
    const TIMEZONE = "America/Bogota";

    if (fechaVisitaStr) {
      // Create date at 00:00:00 in the specific timezone
      fechaVisita = fromZonedTime(`${fechaVisitaStr}T00:00`, TIMEZONE);
    }

    if (fechaVisitaStr && horaInicioStr) {
      // Create timestamp in the specific timezone
      horaInicio = fromZonedTime(`${fechaVisitaStr}T${horaInicioStr}`, TIMEZONE);
    }

    console.log("DEBUG: updateOrdenServicio parsed:", { 
      fechaVisita: fechaVisita?.toISOString(), 
      horaInicio: horaInicio?.toISOString(),
      timezone: TIMEZONE 
    });

    const updatedOrden = await prisma.ordenServicio.update({
      where: { id },
      data: {
        clienteId,
        direccionId,
        vehiculoId,
        empresaId,
        tipoServicioId,
        servicioId,
        tecnicoId,
        zonaId,
        observacion,
        observacionFinal,
        linkMaps,
        fechaVisita,
        horaInicio,
        valorCotizado,
        valorPagado,
        valorRepuestos,
        metodoPagoId,
        estadoServicioId,
        direccionTexto,
        barrio: direccion?.barrio,
        municipio: direccion?.municipio,
        bloque: direccion?.bloque,
        unidad: direccion?.unidad,
        piso: direccion?.piso,
      },
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "UPDATE",
      entidad: "OrdenServicio",
      entidadId: id,
      detalles: {
        descripcion: "Orden de servicio actualizada",
        antes: existingOrden,
        despues: updatedOrden,
      },
    });

    if (tecnicoId && tecnicoId !== existingOrden.tecnicoId) {
      await sendPushNotification(
        tecnicoId,
        "¡Servicio asignado! 🐜",
        `Se te ha asignado un servicio en ${direccionTexto}.`,
        { serviceId: id }
      );
    }

    revalidatePath("/dashboard/servicios");

    if (redis) {
      await redis.del(`stats:ordenes:${usuario.tenantId}`);
    }

    return {
      success: true,
      message: "Orden de servicio actualizada correctamente",
    };
  } catch (error) {
    console.error("Error updating orden:", error);
    return { error: "Error al actualizar la orden de servicio" };
  }
}

export async function sendServiceToTechnician(
  token: string,
  ordenId: number,
  message: string,
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const orden = await prisma.ordenServicio.findUnique({
      where: { id: ordenId, tenantId: usuario.tenantId },
      include: {
        tecnico: true,
      },
    });

    if (!orden) return { error: "Orden no encontrada" };

    if (!orden.tecnicoId)
      return { error: "La orden no tiene técnico asignado" };

    // Fetch full technician data directly from Usuario table to get sensitive fields
    const tecnico = await prisma.usuario.findUnique({
      where: { id: orden.tecnicoId },
      select: {
        numberId: true,
        whatsappGroupId: true,
      },
    });

    if (!tecnico) return { error: "Técnico no encontrado en el sistema" };

    if (!tecnico.numberId || !tecnico.whatsappGroupId) {
      return {
        error: "El técnico no tiene configurado numberId o whatsappGroupId",
      };
    }

    const webhookUrl =
      "https://cobrocartera-n8n.hrymiz.easypanel.host/webhook/send-service-worker";

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        numberId: tecnico.numberId,
        whatsappGroupId: tecnico.whatsappGroupId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook error: ${response.statusText}`);
    }

    return {
      success: true,
      message: "Información enviada al técnico correctamente",
    };
  } catch (error) {
    console.error("Error sending to technician:", error);
    return { error: "Error al enviar la información al técnico" };
  }
}


export async function searchClientes(token: string, term: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  if (!term || term.length < 6) {
    return { clientes: [] };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

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
      take: 15, // Limit results for performance
      include: {
        direcciones: true,
        vehiculos: true,
      }
    });

    return { clientes };

  } catch (error) {
    console.error("Error searching clientes:", error);
    return { error: "Error al buscar clientes" };
  }
}

export async function getTenantsList(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { rol: true },
    });

    if (!usuario || usuario.rol !== "SU_ADMIN") {
      return { error: "No autorizado" };
    }

    const tenants = await prisma.tenant.findMany({
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    return { tenants };
  } catch (error) {
    console.error("Error fetching tenants:", error);
    return { error: "Error al cargar la lista de sistemas" };
  }
}

export async function getAllOrdenesServicioForExport(
  token: string,
  filters: {
    startDate?: string;
    endDate?: string;
    tenantId?: string;
    term?: string;
    empresaId?: string;
    tipoServicioId?: string;
    creadorId?: string;
    tecnicoId?: string;
    metodoPagoId?: string;
    estado?: string;
    municipio?: string;
  }
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const isSuAdmin = usuario.rol === "SU_ADMIN";
    
    // Base filter
    const where: Prisma.OrdenServicioWhereInput = {};

    // Tenant Filter Logic
    if (isSuAdmin) {
      if (filters.tenantId && filters.tenantId !== "all") {
        where.tenantId = Number(filters.tenantId);
      }
      // If "all" (or undefined) for SU_ADMIN, we don't add tenantId to where, effectively fetching all.
    } else {
      // Non-SU_ADMIN can only export their own tenant
      where.tenantId = usuario.tenantId;
    }

    // Filtro por término de búsqueda (nombre, documento, teléfono)
    if (filters.term) {
      const term = filters.term;
      const searchWords = term.split(/\s+/).filter(word => word.length > 0);

      where.OR = [
        {
          cliente: {
            AND: searchWords.map(word => ({
              OR: [
                { nombre: { contains: word, mode: "insensitive" } },
                { apellido: { contains: word, mode: "insensitive" } },
              ]
            }))
          }
        },
        { cliente: { numeroDocumento: { contains: term, mode: "insensitive" } } },
        { cliente: { telefono: { contains: term, mode: "insensitive" } } },
        { cliente: { telefono2: { contains: term, mode: "insensitive" } } },
        { numeroOrden: { contains: term, mode: "insensitive" } },
      ];
    }

    // Filtros específicos
    if (filters.empresaId && filters.empresaId !== "all") {
      where.empresaId = Number(filters.empresaId);
    }

    if (filters.tipoServicioId && filters.tipoServicioId !== "all") {
      where.tipoServicioId = Number(filters.tipoServicioId);
    }

    if (filters.creadorId && filters.creadorId !== "all") {
      where.creadoPorId = Number(filters.creadorId);
    }

    if (filters.tecnicoId && filters.tecnicoId !== "all") {
      if (filters.tecnicoId === "unassigned") {
        where.tecnicoId = null;
      } else {
        where.tecnicoId = Number(filters.tecnicoId);
      }
    }

    if (filters.metodoPagoId && filters.metodoPagoId !== "all") {
      where.metodoPagoId = Number(filters.metodoPagoId);
    }

    if (filters.municipio && filters.municipio !== "all") {
      where.municipio = filters.municipio;
    }

    // Filtro de Estado (Mapeo de lógica de negocio a consulta DB)
    if (filters.estado && filters.estado !== "all") {
      const estado = filters.estado;

      // Check if it's a comma-separated list of IDs
      if (estado.includes(",")) {
        const estadoIds = estado.split(",").map(Number).filter(n => !isNaN(n));
        if (estadoIds.length > 0) {
          where.estadoServicioId = { in: estadoIds };
        }
      }
      // Si el filtro es un ID numérico único
      else if (!isNaN(Number(estado))) {
        where.estadoServicioId = Number(estado);
      } 
      // Lógica para grupos de estados o claves de texto antiguas
      else if (estado === "SERVICIO_NUEVO") {
        where.estadoServicio = { nombre: { contains: "nuevo", mode: "insensitive" } };
      } else if (estado === "PROGRAMADO") {
        where.estadoServicio = {
          OR: [
            { nombre: { contains: "Agendado", mode: "insensitive" } },
            { nombre: { contains: "Programado", mode: "insensitive" } },
            { nombre: { contains: "Reprogramado", mode: "insensitive" } },
          ],
        };
      } else if (estado === "EN_PROCESO") {
        where.estadoServicio = { nombre: { contains: "proceso", mode: "insensitive" } };
      } else if (estado === "SERVICIO_LISTO") {
        where.estadoServicio = {
          OR: [
            { nombre: { contains: "finalizado", mode: "insensitive" } },
            { nombre: { contains: "listo", mode: "insensitive" } },
          ],
        };
      } else if (estado === "CANCELADO") {
         where.estadoServicio = { nombre: { contains: "cancelado", mode: "insensitive" } };
      }
    }

    // Date Filter
    if (filters.startDate || filters.endDate) {
      where.fechaVisita = {};
      const TIMEZONE = "America/Bogota";
      if (filters.startDate) {
        where.fechaVisita.gte = fromZonedTime(`${filters.startDate}T00:00:00`, TIMEZONE);
      }
      if (filters.endDate) {
        where.fechaVisita.lte = fromZonedTime(`${filters.endDate}T23:59:59.999`, TIMEZONE);
      }
    }

    let orderBy: Prisma.OrdenServicioOrderByWithRelationInput | Prisma.OrdenServicioOrderByWithRelationInput[] = { id: "desc" };

    if (filters.startDate || filters.endDate) {
      orderBy = [
        { fechaVisita: "asc" },
        { horaInicio: "asc" }
      ];
    }

    const ordenes = await prisma.ordenServicio.findMany({
      where,
      orderBy,
      // No take/skip because we want ALL records matching criteria
      include: {
        cliente: {
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
        empresa: { select: { id: true, nombre: true } },
        servicio: { select: { nombre: true } },
        tecnico: { select: { nombre: true, apellido: true } },
        tipoServicio: { select: { id: true, nombre: true } },
        creadoPor: { select: { nombre: true, apellido: true } },
        zona: { select: { nombre: true } },
        estadoServicio: { select: { id: true, nombre: true } },
        metodoPago: { select: { id: true, nombre: true } },
        tenant: { select: { nombre: true } }, // Include tenant name for global exports
      },
    });

    const mapEstado = (nombre: string) => {
      const n = nombre.toLowerCase();
      if (n.includes("nuevo")) return "SERVICIO_NUEVO";
      if (
        n.includes("agendado") ||
        n.includes("reprogramado") ||
        n.includes("programado")
      )
        return "PROGRAMADO";
      if (n.includes("proceso")) return "EN_PROCESO";
      if (n.includes("finalizado") || n.includes("listo"))
        return "SERVICIO_LISTO";
      if (n.includes("cancelado")) return "CANCELADO";
      return nombre;
    };

    const ordenesSerialized = ordenes.map((orden) => {
      const s = serializeData(orden) as Record<string, unknown>;
      return {
        ...s,
        estado: mapEstado(orden.estadoServicio.nombre),
        tenantNombre: orden.tenant?.nombre
      };
    });

    return { ordenes: ordenesSerialized };

  } catch (error) {
    console.error("Error exporting orders:", error);
    return { error: "Error al exportar las órdenes" };
  }
}

export async function uploadFacturaElectronica(
  token: string,
  ordenId: number,
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
    const fileName = `factura-${ordenId}-${Date.now()}.${fileExt}`;
    const filePath = `${usuario.tenantId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("facturaElectronica")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      return { error: "Error al subir el archivo a Supabase" };
    }

    const { data: publicUrlData } = supabase.storage
      .from("facturaElectronica")
      .getPublicUrl(filePath);

    const ordenPrevia = await prisma.ordenServicio.findUnique({
      where: { id: ordenId },
      select: { facturaElectronica: true }
    });

    await prisma.ordenServicio.update({
      where: { id: ordenId },
      data: { facturaElectronica: publicUrlData.publicUrl },
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "UPLOAD_FILE",
      entidad: "OrdenServicio",
      entidadId: ordenId,
      detalles: {
        descripcion: "Factura electrónica subida",
        archivo: fileName,
        url: publicUrlData.publicUrl,
        antes: ordenPrevia ? { archivo: ordenPrevia.facturaElectronica } : null,
        despues: { archivo: publicUrlData.publicUrl }
      },
    });

    revalidatePath("/dashboard/servicios");
    return { success: true, message: "Factura/Orden subida correctamente" };
  } catch (error) {
    console.error("Error uploading factura electronica:", error);
    return { error: "Error al procesar la subida de la factura" };
  }
}

export async function uploadComprobantePago(
  token: string,
  ordenId: number,
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
    const fileName = `comprobante-${ordenId}-${Date.now()}.${fileExt}`;
    const filePath = `${usuario.tenantId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("comprobantePago")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      return { error: "Error al subir el archivo a Supabase" };
    }

    const { data: publicUrlData } = supabase.storage
      .from("comprobantePago")
      .getPublicUrl(filePath);

    const ordenPrevia = await prisma.ordenServicio.findUnique({
      where: { id: ordenId },
      select: { comprobantePago: true }
    });

    await prisma.ordenServicio.update({
      where: { id: ordenId },
      data: { comprobantePago: publicUrlData.publicUrl },
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "UPLOAD_FILE",
      entidad: "OrdenServicio",
      entidadId: ordenId,
      detalles: {
        descripcion: "Comprobante de pago subido",
        archivo: fileName,
        url: publicUrlData.publicUrl,
        antes: ordenPrevia ? { archivo: ordenPrevia.comprobantePago } : null,
        despues: { archivo: publicUrlData.publicUrl }
      },
    });

    revalidatePath("/dashboard/servicios");
    return { success: true, message: "Comprobante subido correctamente", path: publicUrlData.publicUrl };
  } catch (error) {
    console.error("Error uploading comprobante pago:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return { error: `Error al procesar la subida del comprobante: ${errorMessage}` };
  }
}

export async function uploadEvidence(
  token: string,
  ordenId: number,
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
    const fileName = `evidencia-${ordenId}-${Date.now()}.${fileExt}`;
    const filePath = `${usuario.tenantId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("evidencia")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      return { error: "Error al subir el archivo a Supabase" };
    }

    const { data: publicUrlData } = supabase.storage
      .from("evidencia")
      .getPublicUrl(filePath);

    const ordenPrevia = await prisma.ordenServicio.findUnique({
      where: { id: ordenId },
      select: { evidenciaPath: true }
    });

    await prisma.ordenServicio.update({
      where: { id: ordenId },
      data: { evidenciaPath: publicUrlData.publicUrl },
    });

    await createAuditLog({
      tenantId: usuario.tenantId,
      usuarioId: payload.userId,
      accion: "UPLOAD_FILE",
      entidad: "OrdenServicio",
      entidadId: ordenId,
      detalles: {
        descripcion: "Evidencia subida",
        archivo: fileName,
        url: publicUrlData.publicUrl,
        antes: ordenPrevia ? { archivo: ordenPrevia.evidenciaPath } : null,
        despues: { archivo: publicUrlData.publicUrl }
      },
    });

    revalidatePath("/dashboard/servicios");
    return { success: true, message: "Evidencia subida correctamente" };
  } catch (error) {
    console.error("Error uploading evidence:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return { error: `Error al procesar la subida de la evidencia: ${errorMessage}` };
  }
}

export async function registrarRefuerzo(
  token: string, 
  ordenOrigenId: number, 
  fechaNueva: Date, 
  montoNuevo: number,
  tecnicoId?: number
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const ordenOrigen = await prisma.ordenServicio.findUnique({
      where: { id: ordenOrigenId },
    });

    if (!ordenOrigen) return { error: "Orden original no encontrada" };

    // Find suitable status
    const estado = await prisma.estadoServicio.findFirst({
      where: {
        tenantId: ordenOrigen.tenantId,
        nombre: "Agendado por Realizar", // Preferred
        activo: true,
      },
    }) || await prisma.estadoServicio.findFirst({
      where: {
        tenantId: ordenOrigen.tenantId,
        activo: true,
      },
    });

    if (!estado) return { error: "No se encontró un estado de servicio válido" };

    // Prepare dates
    const fechaVisita = new Date(fechaNueva);
    fechaVisita.setHours(0, 0, 0, 0); // Normalize to midnight for the date field
    
    // horaInicio keeps the time
    const horaInicio = new Date(fechaNueva);

    // Transaction
    const [nuevaOrden] = await prisma.$transaction([
      prisma.ordenServicio.create({
        data: {
          tenantId: ordenOrigen.tenantId,
          clienteId: ordenOrigen.clienteId,
          servicioId: ordenOrigen.servicioId,
          tipoServicioId: 3, // Refuerzo
          direccionId: ordenOrigen.direccionId,
          direccionTexto: ordenOrigen.direccionTexto || "",
          empresaId: ordenOrigen.empresaId,
          creadoPorId: usuario.id,
          estadoServicioId: estado.id,
          tecnicoId: tecnicoId ?? null,
          fechaVisita: fechaVisita,
          horaInicio: horaInicio,
          valorCotizado: montoNuevo,
          ordenPadreId: ordenOrigenId,
          observacion: `Refuerzo generado desde gestión de servicios. Orden original: ${ordenOrigen.numeroOrden ?? ordenOrigenId}`,
        },
      }),
      prisma.ordenServicio.update({
        where: { id: ordenOrigenId },
        data: { seguimientoRevisado: true },
      }),
    ]);

    revalidatePath("/dashboard/servicios");
    revalidatePath("/dashboard/servicios/seguimiento");
    return { success: true, nuevaOrdenId: nuevaOrden.id, message: "Refuerzo asignado exitosamente" };
  } catch (error) {
    console.error("Error registering reinforcement:", error);
    return { error: "Error al registrar refuerzo" };
  }
}

export async function liquidarOrdenTransferencia(
  token: string,
  ordenId: number,
  data: {
    fechaTransaccion: Date;
    monto: number;
    banco: string;
    referencia: string;
    observacion?: string;
    comprobantePath?: string;
  }
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const orden = await prisma.ordenServicio.findUnique({
      where: { id: ordenId, tenantId: usuario.tenantId },
      select: { 
        id: true, 
        tecnicoId: true, 
        observacion: true, 
        comprobantePago: true,
        tenantId: true 
      }
    });

    if (!orden) return { error: "Orden no encontrada" };
    if (!orden.tecnicoId) return { error: "La orden debe tener un técnico asignado para liquidar y generar trazabilidad." };

    const detallesTransferencia = `
--- LIQUIDACIÓN TRANSFERENCIA ---
Fecha: ${new Date(data.fechaTransaccion).toLocaleDateString()}
Banco: ${data.banco}
Ref: ${data.referencia}
Monto: $${data.monto.toLocaleString()}
Obs: ${data.observacion || "N/A"}
Liquidado por: Usuario #${payload.userId}
--------------------------------`;

    const nuevaObservacion = orden.observacion 
      ? `${orden.observacion}\n${detallesTransferencia}`
      : detallesTransferencia;

    console.log("DEBUG: Creating Consignacion for Orden", ordenId);

    await prisma.$transaction(async (tx) => {
      // 1. Create ConsignacionEfectivo (representing the Transfer)
      const consignacion = await tx.consignacionEfectivo.create({
        data: {
          tenantId: orden.tenantId,
          tecnicoId: orden.tecnicoId!,
          fechaConsignacion: new Date(data.fechaTransaccion),
          valorConsignado: data.monto,
          referenciaBanco: `${data.banco} - ${data.referencia}`,
          comprobantePath: data.comprobantePath || orden.comprobantePago || "LIQUIDACION_DIRECTA_PLATAFORMA",
          estado: "VALIDADA", // Auto-validated since it's an admin liquidation
          observacion: data.observacion,
          creadoPorId: payload.userId,
          diferencia: 0, // Exact match assumed for direct liquidation
        }
      });

      // 2. Link Order to Consignacion
      await tx.consignacionOrden.create({
        data: {
          consignacionId: consignacion.id,
          ordenId: orden.id
        }
      });

      // 3. Update Order Status
      await tx.ordenServicio.update({
        where: { id: ordenId },
        data: {
          estadoPago: "CONCILIADO",
          observacion: nuevaObservacion,
          valorPagado: data.monto,
        },
      });

      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "UPDATE",
        entidad: "OrdenServicio",
        entidadId: ordenId,
        detalles: {
          descripcion: "Orden liquidada (Transferencia) con Trazabilidad",
          consignacionId: consignacion.id,
          transferencia: data,
        },
        tx,
      });
    });

    revalidatePath("/dashboard/servicios");
    return { success: true, message: "Orden liquidada y registrada correctamente" };
  } catch (error) {
    console.error("Error liquidating order:", error);
    return { error: "Error al liquidar la orden" };
  }
}

"use server";
import { clientPhoneVariants, normalizeClientPhone } from "@/lib/client-phone";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/constants/tenants";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { createAuditLog } from "@/lib/audit";

// Helper to serialize BigInt and Decimal
const serializeBigInt = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return Number(obj);
  if (obj instanceof Date) return obj.toISOString();
  if (Prisma.Decimal.isDecimal(obj)) return Number(obj);
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === "object") {
    const newObj: Record<string, unknown> = {};
    Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
      newObj[key] = serializeBigInt(value);
    });
    return newObj;
  }
  return obj;
};

interface ClientFilters {
  municipio?: string;
  barrio?: string;
  startDate?: string;
  endDate?: string;
}

export async function getClientes(
  token: string,
  page: number = 1,
  limit: number = 10,
  term: string = "",
  onlyWithNoServices: boolean = false,
  filters: ClientFilters = {}
) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.ClienteWhereInput = {
      tenantId: PSYCHOLOGY_TENANT_ID,
      deletedAt: null,
    };

    if (onlyWithNoServices) {
      where.CitasPsicologos = {
        none: { tenantId: PSYCHOLOGY_TENANT_ID }
      };
    }

    if (term) {
      const searchWords = term.trim().split(/\s+/).filter(word => word.length > 0);
      
      if (searchWords.length > 0) {
        where.OR = [
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
          { telefono2: { contains: term, mode: "insensitive" } },
          { correo: { contains: term, mode: "insensitive" } },
        ];
      }
    }

    // Filtros de dirección (Municipio y Barrio)
    const direccionConditions: Prisma.DireccionWhereInput = {};
    if (filters.municipio && filters.municipio !== "all") {
      direccionConditions.municipio = filters.municipio;
    }
    if (filters.barrio) {
      direccionConditions.barrio = { contains: filters.barrio, mode: "insensitive" };
    }

    if (Object.keys(direccionConditions).length > 0) {
      where.direcciones = {
        some: direccionConditions
      };
    }

    // Filtros de Fecha de Creación
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        // Ajustar endDate para incluir todo el día
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const skip = (page - 1) * limit;

    const [total, clientes] = await Promise.all([
      prisma.cliente.count({ where }),
      prisma.cliente.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        include: {
          direcciones: {
            take: 1, // Traer al menos la dirección principal para mostrar
          },
          vehiculos: true,
          PaqueteAdquirido: {
            where: {
              estado: "ACTIVO"
            },
            include: {
              TerapiasPsicologos: true
            },
            orderBy: {
              fechaCompra: "desc"
            },
            take: 1
          }
        },
      }),
    ]);

    return {
      clientes: serializeBigInt(clientes),
      total,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    console.error("Error obteniendo pacientes:", error);
    return { error: "Error al cargar los pacientes" };
  }
}

export async function getCliente(token: string, id: number) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.ClienteWhereInput = {
      tenantId: PSYCHOLOGY_TENANT_ID,
      id: id,
      deletedAt: null,
    };

    const cliente = await prisma.cliente.findFirst({
      where,
      include: {
        direcciones: true,
        vehiculos: true,
      },
    });

    if (!cliente) {
      return { error: "Paciente no encontrado" };
    }

    return { cliente };
  } catch (error) {
    console.error("Error obteniendo paciente:", error);
    return { error: "Error al cargar el paciente" };
  }
}

export async function deleteCliente(token: string, id: number) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const where: Prisma.ClienteWhereInput = {
      tenantId: PSYCHOLOGY_TENANT_ID,
      id: id,
    };

    where.tenantId = PSYCHOLOGY_TENANT_ID;

    // Primero verificamos que el cliente pertenezca al tenant
    const cliente = await prisma.cliente.findFirst({
      where,
    });

    if (!cliente) {
      return { error: "Paciente no encontrado o no autorizado" };
    }

    // Soft delete del cliente
    await prisma.$transaction(async (tx) => {
      await tx.cliente.update({
        where: {
          id: id,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await createAuditLog({
        tenantId: PSYCHOLOGY_TENANT_ID,
        usuarioId: payload.userId,
        accion: "DELETE",
        entidad: "Cliente",
        entidadId: id,
        detalles: {
          descripcion: "Paciente eliminado (Soft Delete)",
          antes: cliente,
        },
        tx,
      });
    });

    return { success: true, message: "Paciente eliminado exitosamente" };
  } catch (error) {
    console.error("Error eliminando paciente:", error);
    return { error: "Error al eliminar el paciente. Verifique que no tenga órdenes de servicio asociadas." };
  }
}

interface DireccionForm {
  id: number;
  direccion: string;
  municipio?: string | null;
  barrio?: string | null;
  piso?: string | null;
  bloque?: string | null;
  unidad?: string | null;
  linkMaps?: string | null;
}

interface VehiculoForm {
  id: number;
  placa: string;
  marca?: string | null;
  modelo?: string | null;
  color?: string | null;
  tipo?: string | null;
}

export async function updateCliente(token: string, id: number, formData: FormData) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true }
    });

    if (!cliente) {
      return { error: "Paciente no encontrado" };
    }

    const targetTenantId = cliente.tenantId;

    const nombre = formData.get("nombre") as string;
    const apellido = formData.get("apellido") as string;
    const tipoDocumento = formData.get("tipoDocumento") as string;
    const numeroDocumento = formData.get("numeroDocumento") as string;
    let telefono = formData.get("telefono") as string;
    let telefono2 = formData.get("telefono2") as string;
    const correo = formData.get("correo") as string;
    const registroDocumento = formData.get("registroDocumento") as string;
    const documentoPath = formData.get("documentoPath") as string;
    const direccionesJson = formData.get("direcciones") as string;
    const vehiculosJson = formData.get("vehiculos") as string;

    if (!telefono) {
      return { error: "El teléfono es obligatorio." };
    }

    if (targetTenantId === PSYCHOLOGY_TENANT_ID) {
      try {
        telefono = normalizeClientPhone(telefono);
        telefono2 = normalizeClientPhone(telefono2 === "No Concretado" ? "" : telefono2 || "");
        if (!telefono) return { error: "El teléfono es obligatorio." };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Teléfono inválido" };
      }
    }

    // Verificar si ya existe otro cliente con el mismo teléfono (primario o secundario)
    // Helper para verificar si es un número válido (ignora textos como 'No Concretado')
    const isValidPhoneNumber = (t: string) => {
        return /^[+\d\s-]+$/.test(t) && t.replace(/\D/g, '').length > 5;
    };

    const orConditions: Prisma.ClienteWhereInput[] = [];

    if (isValidPhoneNumber(telefono.trim())) {
        orConditions.push({ telefono: telefono.trim() });
        orConditions.push({ telefono2: telefono.trim() });
    }

    if (telefono2 && telefono2.trim() && isValidPhoneNumber(telefono2.trim())) {
        orConditions.push({ telefono: telefono2.trim() });
        orConditions.push({ telefono2: telefono2.trim() });
    }

    if (targetTenantId === PSYCHOLOGY_TENANT_ID) {
      const variants = [...new Set([...clientPhoneVariants(telefono), ...clientPhoneVariants(telefono2)])];
      orConditions.push({ telefono: { in: variants } }, { telefono2: { in: variants } });
    }

    if (orConditions.length > 0) {
        const existingCliente = await prisma.cliente.findFirst({
            where: {
                tenantId: targetTenantId,
                deletedAt: null,
                id: { not: id }, // Excluir el cliente actual
                OR: orConditions
            },
        });

        if (existingCliente) {
            return { error: "Ya existe otro paciente registrado con este número de teléfono." };
        }
    }

    let direccionesForm: DireccionForm[] = [];
    if (direccionesJson) {
      try {
        direccionesForm = JSON.parse(direccionesJson);
      } catch (e) {
        console.error("Error parsing direcciones:", e);
      }
    }

    let vehiculosForm: VehiculoForm[] = [];
    if (vehiculosJson) {
        try {
            vehiculosForm = JSON.parse(vehiculosJson);
        } catch(e) {
            console.error("Error parsing vehiculos:", e);
        }
    }

    // 1. Get current relations from DB to compare
    const [currentDirecciones, currentVehiculos] = await Promise.all([
        prisma.direccion.findMany({ where: { clienteId: id, tenantId: targetTenantId } }),
        prisma.vehiculo.findMany({ where: { clienteId: id, tenantId: targetTenantId } })
    ]);

    const currentDireccionesIds = currentDirecciones.map(d => d.id);
    const currentVehiculosIds = currentVehiculos.map(v => v.id);

    // 2. Differentiate what to create, update, or delete
    const direccionesToUpdate = direccionesForm.filter(d => currentDireccionesIds.includes(d.id));
    const direccionesToCreate = direccionesForm.filter(d => !currentDireccionesIds.includes(d.id));
    const direccionesToDelete = currentDireccionesIds.filter(id => !direccionesForm.some(d => d.id === id));
    
    const vehiculosToUpdate = vehiculosForm.filter(v => currentVehiculosIds.includes(v.id));
    const vehiculosToCreate = vehiculosForm.filter(v => !currentVehiculosIds.includes(v.id));
    const vehiculosToDelete = currentVehiculosIds.filter(id => !vehiculosForm.some(v => v.id === id));


    await prisma.$transaction(async (tx) => {
      // --- Update base client info ---
      await tx.cliente.update({
        where: { id: id },
        data: {
          nombre,
          apellido,
          tipoDocumento,
          numeroDocumento,
          telefono,
          telefono2: telefono2 || null,
          correo: (!correo || !correo.trim()) ? "noconcretado@noconcretado.com" : correo.trim(),
          registroDocumento: registroDocumento || undefined, // undefined to avoid null overwrite if empty string logic is different
          documentoPath: documentoPath || undefined,
        },
      });

      // --- Handle Direcciones ---
      if (direccionesToDelete.length > 0) {
        await tx.direccion.deleteMany({
          where: { id: { in: direccionesToDelete } },
        });
      }

      for (const dir of direccionesToUpdate) {
        await tx.direccion.update({
          where: { id: dir.id },
          data: {
            direccion: dir.direccion,
            municipio: dir.municipio || null,
            barrio: dir.barrio || null,
            piso: dir.piso || null,
            bloque: dir.bloque || null,
            unidad: dir.unidad || null,
            linkMaps: dir.linkMaps || null,
          },
        });
      }

      if (direccionesToCreate.length > 0) {
        await tx.cliente.update({
          where: { id: id },
          data: {
            direcciones: {
              create: direccionesToCreate.map(dir => ({
                tenantId: targetTenantId,
                direccion: dir.direccion,
                municipio: dir.municipio || null,
                barrio: dir.barrio || null,
                piso: dir.piso || null,
                bloque: dir.bloque || null,
                unidad: dir.unidad || null,
                linkMaps: dir.linkMaps || null,
              })),
            }
          }
        });
      }

      // --- Handle Vehiculos ---
      if (vehiculosToDelete.length > 0) {
          await tx.vehiculo.deleteMany({
              where: { id: { in: vehiculosToDelete } }
          });
      }
      
      for (const veh of vehiculosToUpdate) {
          await tx.vehiculo.update({
              where: { id: veh.id },
              data: {
                  placa: veh.placa,
                  marca: veh.marca || null,
                  modelo: veh.modelo || null,
                  color: veh.color || null,
                  tipo: veh.tipo || null,
              }
          });
      }

      if (vehiculosToCreate.length > 0) {
          await tx.cliente.update({
            where: { id: id },
            data: {
              vehiculos: {
                create: vehiculosToCreate.map(veh => ({
                    tenantId: targetTenantId,
                    placa: veh.placa,
                    marca: veh.marca || null,
                    modelo: veh.modelo || null,
                    color: veh.color || null,
                    tipo: veh.tipo || null,
                })),
              }
            }
          });
      }

      await createAuditLog({
        tenantId: targetTenantId,
        usuarioId: payload.userId,
        accion: "UPDATE",
        entidad: "Cliente",
        entidadId: id,
        detalles: {
            antes: cliente,
            despues: {
                nombre, apellido, tipoDocumento, numeroDocumento, telefono, telefono2, correo,
                direcciones: direccionesForm,
                vehiculos: vehiculosForm
            },
            descripcion: "Actualización completa de paciente"
        },
        tx
      });
    });

    revalidatePath("/dashboard/clientes");
    return { success: true, message: "Paciente actualizado exitosamente.", clienteId: id };
  } catch (error) {
    console.error("Error actualizando paciente:", error);
    // Verificar error de FK
    if (JSON.stringify(error).includes("Foreign key constraint failed")) {
       return { error: "No se pueden eliminar direcciones que tienen órdenes de servicio asociadas." };
    }
    return { error: "Error al actualizar el paciente." };
  }
}

export async function getClientesStats(token: string) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const whereBase = {
      tenantId: PSYCHOLOGY_TENANT_ID,
      deletedAt: null
    };

    const whereCliente: Prisma.ClienteWhereInput = { ...whereBase };
    const whereDireccion: Prisma.DireccionWhereInput = {
      tenantId: PSYCHOLOGY_TENANT_ID,
      cliente: { tenantId: PSYCHOLOGY_TENANT_ID, deletedAt: null }
    };

    // Total clientes
    const totalClientes = await prisma.cliente.count({
      where: whereCliente,
    });

    // Agrupar por municipio
    const municipiosGroup = await prisma.direccion.groupBy({
      by: ['municipio'],
      where: { 
        ...whereDireccion,
        municipio: { not: null },
      },
      _count: {
        municipio: true
      },
      orderBy: {
        _count: {
          municipio: 'desc'
        }
      },
      take: 5
    });

    // Agrupar por barrio
    const barriosGroup = await prisma.direccion.groupBy({
      by: ['barrio'],
      where: { 
        ...whereDireccion,
        barrio: { not: null },
      },
      _count: {
        barrio: true
      },
      orderBy: {
        _count: {
          barrio: 'desc'
        }
      },
      take: 5
    });

    const municipiosStats = municipiosGroup.map(g => ({
      nombre: g.municipio || "Desconocido",
      cantidad: g._count.municipio
    }));

    const barriosStats = barriosGroup.map(g => ({
      nombre: g.barrio || "Desconocido",
      cantidad: g._count.barrio
    }));

    return { 
      stats: {
        totalClientes,
        municipios: municipiosStats,
        barrios: barriosStats
      }
    };
  } catch (error) {
    console.error("Error obteniendo estadísticas:", error);
    return { error: "Error al cargar estadísticas" };
  }
}

export async function getClienteServicios(token: string, clienteId: number) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const citas = await prisma.citasPsicologos.findMany({
      where: {
        tenantId: PSYCHOLOGY_TENANT_ID,
        pacienteId: clienteId,
        Cliente: { tenantId: PSYCHOLOGY_TENANT_ID, deletedAt: null },
      },
      include: {
        Servicio_CitasPsicologos_servicioIdToServicio: { select: { nombre: true } },
        Usuario_CitasPsicologos_psicologoIdToUsuario: { select: { nombre: true, apellido: true } },
      },
      orderBy: { fechaCita: "desc" },
    });
    const serializedServicios = citas.map((cita) => ({
      id: Number(cita.id),
      numeroOrden: `CITA-${cita.id}`,
      fechaVisita: cita.fechaCita,
      servicio: { nombre: cita.Servicio_CitasPsicologos_servicioIdToServicio?.nombre || "Cita psicológica" },
      tecnico: cita.Usuario_CitasPsicologos_psicologoIdToUsuario,
      estadoServicio: { nombre: cita.realizada === null ? "Cancelada" : cita.realizada ? "Realizada" : "Programada" },
    }));

    return { servicios: serializedServicios };
  } catch (error) {
    console.error("Error obteniendo servicios del paciente:", error);
    return { error: "Error al cargar los servicios del paciente" };
  }
}

export async function getAllClientesForExport(
  token: string,
  term: string = "",
  onlyWithNoServices: boolean = false,
  filters: ClientFilters = {}
) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.ClienteWhereInput = {
      tenantId: PSYCHOLOGY_TENANT_ID,
      deletedAt: null,
    };

    if (onlyWithNoServices) {
      where.CitasPsicologos = {
        none: { tenantId: PSYCHOLOGY_TENANT_ID }
      };
    }

    if (term) {
      const searchWords = term.trim().split(/\s+/).filter(word => word.length > 0);
      
      if (searchWords.length > 0) {
        where.OR = [
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
          { telefono2: { contains: term, mode: "insensitive" } },
          { correo: { contains: term, mode: "insensitive" } },
        ];
      }
    }

    const direccionConditions: Prisma.DireccionWhereInput = {};
    if (filters.municipio && filters.municipio !== "all") {
      direccionConditions.municipio = filters.municipio;
    }
    if (filters.barrio) {
      direccionConditions.barrio = { contains: filters.barrio, mode: "insensitive" };
    }

    if (Object.keys(direccionConditions).length > 0) {
      where.direcciones = {
        some: direccionConditions
      };
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        direcciones: true,
        vehiculos: true,
        PaqueteAdquirido: {
          where: {
            estado: "ACTIVO"
          },
          include: {
            TerapiasPsicologos: true
          },
          orderBy: {
            fechaCompra: "desc"
          }
        }
      },
    });

    return { clientes: serializeBigInt(clientes) };
  } catch (error) {
    console.error("Error exportando pacientes:", error);
    return { error: "Error al exportar los pacientes" };
  }
}

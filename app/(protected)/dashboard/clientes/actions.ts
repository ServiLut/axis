"use server";

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
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.ClienteWhereInput = {
      deletedAt: null,
    };

    if (onlyWithNoServices) {
      where.servicios = {
        none: {}
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
    console.error("Error obteniendo clientes:", error);
    return { error: "Error al cargar los clientes" };
  }
}

export async function getCliente(token: string, id: number) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.ClienteWhereInput = {
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
      return { error: "Cliente no encontrado" };
    }

    return { cliente };
  } catch (error) {
    console.error("Error obteniendo cliente:", error);
    return { error: "Error al cargar el cliente" };
  }
}

export async function deleteCliente(token: string, id: number) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const where: Prisma.ClienteWhereInput = {
      id: id,
    };

    if (usuario.rol !== "SU_ADMIN") {
      where.tenantId = usuario.tenantId;
    }

    // Primero verificamos que el cliente pertenezca al tenant
    const cliente = await prisma.cliente.findFirst({
      where,
    });

    if (!cliente) {
      return { error: "Cliente no encontrado o no autorizado" };
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
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "DELETE",
        entidad: "Cliente",
        entidadId: id,
        detalles: {
          descripcion: "Cliente eliminado (Soft Delete)",
          antes: cliente,
        },
        tx,
      });
    });

    return { success: true, message: "Cliente eliminado exitosamente" };
  } catch (error) {
    console.error("Error eliminando cliente:", error);
    return { error: "Error al eliminar el cliente. Verifique que no tenga órdenes de servicio asociadas." };
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
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      select: { tenantId: true }
    });

    if (!cliente) {
      return { error: "Cliente no encontrado" };
    }

    const targetTenantId = cliente.tenantId;

    const nombre = formData.get("nombre") as string;
    const apellido = formData.get("apellido") as string;
    const tipoDocumento = formData.get("tipoDocumento") as string;
    const numeroDocumento = formData.get("numeroDocumento") as string;
    const telefono = formData.get("telefono") as string;
    const telefono2 = formData.get("telefono2") as string;
    const correo = formData.get("correo") as string;
    const registroDocumento = formData.get("registroDocumento") as string;
    const documentoPath = formData.get("documentoPath") as string;
    const direccionesJson = formData.get("direcciones") as string;
    const vehiculosJson = formData.get("vehiculos") as string;

    if (!telefono) {
      return { error: "El teléfono es obligatorio." };
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
            return { error: "Ya existe otro cliente registrado con este número de teléfono." };
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
            descripcion: "Actualización completa de cliente"
        },
        tx
      });
    });

    revalidatePath("/dashboard/clientes");
    return { success: true, message: "Cliente actualizado exitosamente.", clienteId: id };
  } catch (error) {
    console.error("Error actualizando cliente:", error);
    // Verificar error de FK
    if (JSON.stringify(error).includes("Foreign key constraint failed")) {
       return { error: "No se pueden eliminar direcciones que tienen órdenes de servicio asociadas." };
    }
    return { error: "Error al actualizar el cliente." };
  }
}

export async function getClientesStats(token: string) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const whereBase = {
      deletedAt: null
    };

    const whereCliente: Prisma.ClienteWhereInput = { ...whereBase };
    const whereDireccion: Prisma.DireccionWhereInput = {
      cliente: { deletedAt: null }
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
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.OrdenServicioWhereInput = {
      clienteId: clienteId,
    };

    const servicios = await prisma.ordenServicio.findMany({
      where,
      include: {
        servicio: true,
        estadoServicio: true,
        tecnico: {
          select: {
            nombre: true,
            apellido: true,
          },
        },
        vehiculo: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const serializedServicios = servicios.map(servicio => ({
      ...servicio,
      valorCotizado: servicio.valorCotizado ? servicio.valorCotizado.toNumber() : 0,
      valorPagado: servicio.valorPagado ? servicio.valorPagado.toNumber() : 0,
      valorRepuestos: servicio.valorRepuestos ? servicio.valorRepuestos.toNumber() : 0,
      valorRepuestosTecnico: servicio.valorRepuestosTecnico ? servicio.valorRepuestosTecnico.toNumber() : 0,
    }));

    return { servicios: serializedServicios };
  } catch (error) {
    console.error("Error obteniendo servicios del cliente:", error);
    return { error: "Error al cargar los servicios del cliente" };
  }
}

export async function getAllClientesForExport(
  token: string,
  term: string = "",
  onlyWithNoServices: boolean = false,
  filters: ClientFilters = {}
) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.ClienteWhereInput = {
      deletedAt: null,
    };

    if (onlyWithNoServices) {
      where.servicios = {
        none: {}
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
    console.error("Error exportando clientes:", error);
    return { error: "Error al exportar los clientes" };
  }
}

"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { Prisma } from "@/prisma/generated/prisma/client";

export async function getAuditoria(
  token: string,
  page: number = 1,
  limit: number = 20,
  filtros: {
    entidad?: string;
    accion?: string;
    usuarioId?: number;
    fechaInicio?: string;
    fechaFin?: string;
    entidadId?: string;
  } = {}
) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.AuditoriaWhereInput = {
      tenantId: payload.tenantId,
    };

    if (filtros.entidad) {
      where.entidad = filtros.entidad;
    }

    if (filtros.entidadId) {
      where.entidadId = filtros.entidadId;
    }

    if (filtros.accion) {
      where.accion = filtros.accion;
    }

    if (filtros.usuarioId) {
      where.usuarioId = filtros.usuarioId;
    }

    if (filtros.fechaInicio || filtros.fechaFin) {
      where.createdAt = {};
      if (filtros.fechaInicio) {
        where.createdAt.gte = new Date(filtros.fechaInicio);
      }
      if (filtros.fechaFin) {
        where.createdAt.lte = new Date(filtros.fechaFin);
      }
    }

    const skip = (page - 1) * limit;

    const [total, logs] = await Promise.all([
      prisma.auditoria.count({ where }),
      prisma.auditoria.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        include: {
          Usuario: {
            select: {
              nombre: true,
              apellido: true,
              username: true,
            },
          },
        },
      }),
    ]);

    // --- ID Collection for Name Resolution ---
    const collectedIds = {
      empresaIds: new Set<number>(),
      clienteIds: new Set<number>(),
      usuarioIds: new Set<number>(), // Covers tecnicoId, creadoPorId, usuarioId
      servicioIds: new Set<number>(),
      tipoServicioIds: new Set<number>(),
      estadoServicioIds: new Set<number>(),
      metodoPagoIds: new Set<number>(),
      zonaIds: new Set<number>(),
      direccionIds: new Set<number>(),
      vehiculoIds: new Set<number>(),
    };

    const extractIds = (obj: Record<string, unknown>) => {
      if (!obj || typeof obj !== 'object') return;
      if (typeof obj.empresaId === 'number' || typeof obj.empresaId === 'string') collectedIds.empresaIds.add(Number(obj.empresaId));
      if (typeof obj.clienteId === 'number' || typeof obj.clienteId === 'string') collectedIds.clienteIds.add(Number(obj.clienteId));
      if (typeof obj.tecnicoId === 'number' || typeof obj.tecnicoId === 'string') collectedIds.usuarioIds.add(Number(obj.tecnicoId));
      if (typeof obj.creadoPorId === 'number' || typeof obj.creadoPorId === 'string') collectedIds.usuarioIds.add(Number(obj.creadoPorId));
      if (typeof obj.usuarioId === 'number' || typeof obj.usuarioId === 'string') collectedIds.usuarioIds.add(Number(obj.usuarioId));
      if (typeof obj.servicioId === 'number' || typeof obj.servicioId === 'string') collectedIds.servicioIds.add(Number(obj.servicioId));
      if (typeof obj.tipoServicioId === 'number' || typeof obj.tipoServicioId === 'string') collectedIds.tipoServicioIds.add(Number(obj.tipoServicioId));
      if (typeof obj.estadoServicioId === 'number' || typeof obj.estadoServicioId === 'string') collectedIds.estadoServicioIds.add(Number(obj.estadoServicioId));
      if (typeof obj.metodoPagoId === 'number' || typeof obj.metodoPagoId === 'string') collectedIds.metodoPagoIds.add(Number(obj.metodoPagoId));
      if (typeof obj.zonaId === 'number' || typeof obj.zonaId === 'string') collectedIds.zonaIds.add(Number(obj.zonaId));
      if (typeof obj.direccionId === 'number' || typeof obj.direccionId === 'string') collectedIds.direccionIds.add(Number(obj.direccionId));
      if (typeof obj.vehiculoId === 'number' || typeof obj.vehiculoId === 'string') collectedIds.vehiculoIds.add(Number(obj.vehiculoId));
    };

    logs.forEach(log => {
      const detalles = log.detalles as Record<string, unknown> | null;
      if (detalles) {
        if (detalles.antes && typeof detalles.antes === 'object') {
          extractIds(detalles.antes as Record<string, unknown>);
        }
        if (detalles.despues && typeof detalles.despues === 'object') {
          extractIds(detalles.despues as Record<string, unknown>);
        }
      }
    });

    // --- Batch Fetch Names ---
    const [
      empresas,
      clientes,
      usuarios,
      servicios,
      tiposServicios,
      estadosServicio,
      metodosPago,
      zonas,
      direcciones,
      vehiculos
    ] = await Promise.all([
      collectedIds.empresaIds.size > 0 ? prisma.empresa.findMany({ where: { id: { in: Array.from(collectedIds.empresaIds) } }, select: { id: true, nombre: true } }) : [],
      collectedIds.clienteIds.size > 0 ? prisma.cliente.findMany({ where: { id: { in: Array.from(collectedIds.clienteIds) } }, select: { id: true, nombre: true, apellido: true } }) : [],
      collectedIds.usuarioIds.size > 0 ? prisma.usuario.findMany({ where: { id: { in: Array.from(collectedIds.usuarioIds) } }, select: { id: true, nombre: true, apellido: true } }) : [],
      collectedIds.servicioIds.size > 0 ? prisma.servicio.findMany({ where: { id: { in: Array.from(collectedIds.servicioIds) } }, select: { id: true, nombre: true } }) : [],
      collectedIds.tipoServicioIds.size > 0 ? prisma.tipoServicio.findMany({ where: { id: { in: Array.from(collectedIds.tipoServicioIds) } }, select: { id: true, nombre: true } }) : [],
      collectedIds.estadoServicioIds.size > 0 ? prisma.estadoServicio.findMany({ where: { id: { in: Array.from(collectedIds.estadoServicioIds) } }, select: { id: true, nombre: true } }) : [],
      collectedIds.metodoPagoIds.size > 0 ? prisma.metodoPago.findMany({ where: { id: { in: Array.from(collectedIds.metodoPagoIds) } }, select: { id: true, nombre: true } }) : [],
      collectedIds.zonaIds.size > 0 ? prisma.zona.findMany({ where: { id: { in: Array.from(collectedIds.zonaIds) } }, select: { id: true, nombre: true } }) : [],
      collectedIds.direccionIds.size > 0 ? prisma.direccion.findMany({ where: { id: { in: Array.from(collectedIds.direccionIds) } }, select: { id: true, direccion: true, municipio: true } }) : [],
      collectedIds.vehiculoIds.size > 0 ? prisma.vehiculo.findMany({ where: { id: { in: Array.from(collectedIds.vehiculoIds) } }, select: { id: true, placa: true, marca: true } }) : [],
    ]);

    // --- Build Reference Map ---
    const references = {
      empresaId: Object.fromEntries(empresas.map(e => [e.id, e.nombre])),
      clienteId: Object.fromEntries(clientes.map(c => [c.id, `${c.nombre || ''} ${c.apellido || ''}`.trim()])),
      tecnicoId: Object.fromEntries(usuarios.map(u => [u.id, `${u.nombre} ${u.apellido}`])),
      creadoPorId: Object.fromEntries(usuarios.map(u => [u.id, `${u.nombre} ${u.apellido}`])),
      usuarioId: Object.fromEntries(usuarios.map(u => [u.id, `${u.nombre} ${u.apellido}`])),
      servicioId: Object.fromEntries(servicios.map(s => [s.id, s.nombre])),
      tipoServicioId: Object.fromEntries(tiposServicios.map(t => [t.id, t.nombre])),
      estadoServicioId: Object.fromEntries(estadosServicio.map(e => [e.id, e.nombre])),
      metodoPagoId: Object.fromEntries(metodosPago.map(m => [m.id, m.nombre])),
      zonaId: Object.fromEntries(zonas.map(z => [z.id, z.nombre])),
      direccionId: Object.fromEntries(direcciones.map(d => [d.id, `${d.direccion} (${d.municipio || ''})`])),
      vehiculoId: Object.fromEntries(vehiculos.map(v => [v.id, `${v.placa} ${v.marca || ''}`])),
    };

    return {
      logs,
      total,
      totalPages: Math.ceil(total / limit),
      references,
    };
  } catch (error) {
    console.error("Error obteniendo auditoría:", error);
    return { error: "Error al cargar los registros de auditoría" };
  }
}

export async function getEntidadesAuditadas(token: string) {
    const payload = verifyToken(token);
    if (!payload) return { error: "No autorizado" };

    try {
        const entidades = await prisma.auditoria.groupBy({
            by: ['entidad'],
            where: { tenantId: payload.tenantId }
        });
        return { entidades: entidades.map(e => e.entidad) };
    } catch {
        return { error: "Error al cargar entidades" };
    }
}

export async function getAuditFilterOptions(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const [usuarios, entidadesGroup] = await Promise.all([
      prisma.usuario.findMany({
        where: { tenantId: payload.tenantId },
        select: { id: true, nombre: true, apellido: true, username: true },
        orderBy: { nombre: 'asc' }
      }),
      prisma.auditoria.groupBy({
        by: ['entidad'],
        where: { tenantId: payload.tenantId },
        orderBy: { entidad: 'asc' }
      })
    ]);

    return {
      usuarios,
      entidades: entidadesGroup.map(e => e.entidad)
    };
  } catch (error) {
    console.error("Error cargando opciones de filtro:", error);
    return { usuarios: [], entidades: [], error: "Error al cargar filtros" };
  }
}

export async function getAuditoriaForExport(
  token: string,
  filtros: {
    entidad?: string;
    accion?: string;
    usuarioId?: number;
    fechaInicio?: string;
    fechaFin?: string;
    entidadId?: string;
  } = {}
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const where: Prisma.AuditoriaWhereInput = {
      tenantId: payload.tenantId,
    };

    if (filtros.entidad && filtros.entidad !== "all") where.entidad = filtros.entidad;
    if (filtros.accion && filtros.accion !== "all") where.accion = filtros.accion;
    if (filtros.usuarioId) where.usuarioId = filtros.usuarioId;
    if (filtros.entidadId) where.entidadId = filtros.entidadId;

    if (filtros.fechaInicio || filtros.fechaFin) {
      where.createdAt = {};
      if (filtros.fechaInicio) {
        where.createdAt.gte = new Date(filtros.fechaInicio);
      }
      if (filtros.fechaFin) {
        // Adjust end date to end of day
        const end = new Date(filtros.fechaFin);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const logs = await prisma.auditoria.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000, // Safety limit
      include: {
        Usuario: {
          select: {
            nombre: true,
            apellido: true,
            username: true,
          },
        },
      },
    });

    // Serialize dates and JSON
    return { 
        logs: logs.map(log => ({
            ...log,
            createdAt: log.createdAt.toISOString(),
            detalles: JSON.stringify(log.detalles)
        }))
    };
  } catch (error) {
    console.error("Error exportando auditoría:", error);
    return { error: "Error al exportar registros" };
  }
}

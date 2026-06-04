"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";

export async function getAsesores(token: string) {
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

    const where: Prisma.UsuarioWhereInput = usuario.rol === "SU_ADMIN" 
      ? { rol: "ASESOR" } 
      : { tenantId: usuario.tenantId, rol: "ASESOR" };

    const asesores = await prisma.usuario.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        rol: true,
        telefono: true,
        createdAt: true,
      },
    });

    return { asesores };
  } catch (error) {
    console.error("Error obteniendo asesores:", error);
    return { error: "Error al cargar los asesores" };
  }
}

export async function getAsesor(token: string, id: number) {
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

    const where: Prisma.UsuarioWhereInput = { id, rol: "ASESOR" };
    if (usuario.rol !== "SU_ADMIN") {
      where.tenantId = usuario.tenantId;
    }

    const asesor = await prisma.usuario.findFirst({
      where,
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        rol: true,
        telefono: true,
        createdAt: true,
      },
    });

    if (!asesor) {
      return { error: "Asesor no encontrado" };
    }

    return { asesor };
  } catch (error) {
    console.error("Error obteniendo asesor:", error);
    return { error: "Error al cargar el asesor" };
  }
}

export async function deleteAsesor(token: string, id: number) {
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

    const where: Prisma.UsuarioWhereInput = { id, rol: "ASESOR" };
    if (usuario.rol !== "SU_ADMIN") {
      where.tenantId = usuario.tenantId;
    }

    // Verificar que el usuario a eliminar sea un asesor y pertenezca al tenant (si no es SU_ADMIN)
    const asesorToDelete = await prisma.usuario.findFirst({
      where,
    });

    if (!asesorToDelete) {
      return { error: "Asesor no encontrado o no autorizado para eliminar" };
    }

    await prisma.usuario.delete({
      where: {
        id: id,
      },
    });

    revalidatePath("/dashboard/usuarios/asesores");
    return { success: true, message: "Asesor eliminado exitosamente" };
  } catch (error) {
    console.error("Error eliminando asesor:", error);
    return {
      error:
        "Error al eliminar el asesor. Verifique que no tenga registros asociados.",
    };
  }
}

export async function updateAsesor(token: string, id: number, formData: FormData) {
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

    const nombre = formData.get("nombre") as string;
    const apellido = formData.get("apellido") as string;
    const telefono = formData.get("telefono") as string;
    const rol = formData.get("rol") as "SU_ADMIN" | "ADMIN" | "TECNICO" | "ASESOR";
    
    const where: Prisma.UsuarioWhereInput = { id, rol: "ASESOR" };
    if (usuario.rol !== "SU_ADMIN") {
      where.tenantId = usuario.tenantId;
    }

    // Verificar tenant y rol
    const asesor = await prisma.usuario.findFirst({
      where,
    });

    if (!asesor) {
      return { error: "Asesor no encontrado" };
    }

    await prisma.usuario.update({
      where: { id: id },
      data: {
        nombre,
        apellido,
        telefono,
        rol,
      },
    });

    revalidatePath("/dashboard/usuarios/asesores");
    return { success: true, message: "Asesor actualizado exitosamente" };
  } catch (error) {
    console.error("Error actualizando asesor:", error);
    return { error: "Error al actualizar el asesor" };
  }
}

export async function getServiciosFinalizadosPorAsesor(
  token: string,
  asesorId: number,
  filters?: {
    fechaInicio?: string;
    fechaFin?: string;
  }
) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.OrdenServicioWhereInput = {
      creadoPorId: asesorId,
      estadoServicioId: 4, // 4 = Finalizado
    };

    if (filters?.fechaInicio || filters?.fechaFin) {
      where.fechaVisita = {};
      if (filters.fechaInicio) {
        where.fechaVisita.gte = new Date(filters.fechaInicio);
      }
      if (filters.fechaFin) {
        const fin = new Date(filters.fechaFin);
        fin.setHours(23, 59, 59, 999);
        where.fechaVisita.lte = fin;
      }
    }

    const servicios = await prisma.ordenServicio.findMany({
      where,
      select: {
        id: true,
        numeroOrden: true,
        fechaVisita: true,
        direccionTexto: true,
        valorPagado: true,
        cliente: {
          select: {
            nombre: true,
            apellido: true,
          },
        },
      },
      orderBy: {
        fechaVisita: "desc",
      },
    });

    // Convert Decimal to string for serialization
    const serializedServicios = servicios.map((s) => ({
      ...s,
      valorPagado: s.valorPagado ? s.valorPagado.toString() : "0",
    }));

    return { servicios: serializedServicios };
  } catch (error) {
    console.error(
      "Error obteniendo servicios finalizados por asesor:",
      error,
    );
    return { error: "Error al cargar los servicios" };
  }
}

export async function getReporteServiciosFinalizados(
  token: string,
  filters: {
    asesorId?: number;
    fechaInicio?: string;
    fechaFin?: string;
  }
) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const where: Prisma.OrdenServicioWhereInput = {
      estadoServicioId: 4, // Finalizado
    };

    if (filters.asesorId) {
      where.creadoPorId = filters.asesorId;
    }

    if (filters.fechaInicio || filters.fechaFin) {
      where.fechaVisita = {};
      if (filters.fechaInicio) {
        where.fechaVisita.gte = new Date(filters.fechaInicio);
      }
      if (filters.fechaFin) {
        // Ajustar al final del día
        const fin = new Date(filters.fechaFin);
        fin.setHours(23, 59, 59, 999);
        where.fechaVisita.lte = fin;
      }
    }

    const servicios = await prisma.ordenServicio.findMany({
      where,
      select: {
        id: true,
        numeroOrden: true,
        fechaVisita: true,
        valorPagado: true,
        direccionTexto: true,
        cliente: {
          select: {
            nombre: true,
            apellido: true,
            numeroDocumento: true,
            telefono: true,
            correo: true
          },
        },
        creadoPor: {
          select: {
            nombre: true,
            apellido: true,
          },
        },
        tipoServicio: {
          select: {
            nombre: true
          }
        },
        metodoPago: {
          select: {
            nombre: true
          }
        }
      },
      orderBy: {
        fechaVisita: "desc",
      },
    });

    // Serializar para el cliente
    const serializedServicios = servicios.map((s) => ({
      ...s,
      valorPagado: s.valorPagado ? s.valorPagado.toString() : "0",
    }));

    return { servicios: serializedServicios };
  } catch (error) {
    console.error("Error generando reporte:", error);
    return { error: "Error al generar el reporte" };
  }
}

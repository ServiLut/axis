"use server";

import prisma from "@/lib/prisma-fresh";
import { verifyToken } from "@/lib/auth";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/psychology";
import { revalidatePath } from "next/cache";

const isAccountAdmin = (role: string | null) => role === "ADMIN" || role === "SU_ADMIN";
const accountAccessWhere = (userId: number, role: string | null) => ({
  tenantId: PSYCHOLOGY_TENANT_ID,
  usuario: { tenantId: PSYCHOLOGY_TENANT_ID },
  ...(isAccountAdmin(role) ? {} : { usuarioId: userId }),
});

export async function getTurnos(token: string) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const turnos = await prisma.turno.findMany({
      where: {
        tenantId: PSYCHOLOGY_TENANT_ID,
        usuarioId: payload.userId,
        cuentaCobroId: null, // Only fetch active turnos
      },
      select: {
        id: true,
        tenantId: true,
        usuarioId: true,
        fecha: true,
        horaEntrada: true,
        horaSalida: true,
        tiempoDescanso: true,
        observaciones: true,
        createdAt: true,
        valorTotal: true,
        fotoEntrada: true,
        fotoSalida: true,
        cuentaCobroId: true,
        usuario: {
          select: {
            nombre: true,
            apellido: true
          }
        }
      },
      orderBy: {
        fecha: "desc",
      },
    });

    return { turnos };
  } catch (error) {
    console.error("Error obteniendo turnos:", error);
    return { error: "Error al cargar los registros" };
  }
}

export async function updateTurno(token: string, id: number, formData: FormData) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
      select: { tenantId: true, rol: true },
    });

    if (!usuario) {
      return { error: "Usuario no encontrado" };
    }

    const existingTurno = await prisma.turno.findFirst({
        where: { id, tenantId: PSYCHOLOGY_TENANT_ID, usuarioId: payload.userId },
    });

    if (!existingTurno) {
        return { error: "Turno no encontrado" };
    }


    if (existingTurno.usuarioId !== payload.userId) {
        return { error: "No autorizado" };
    }
    
    if (existingTurno.cuentaCobroId) {
         return { error: "No se puede editar un turno que ya pertenece a una cuenta de cobro cerrada." };
    }

    const fechaStr = formData.get("fecha") as string;
    const horaEntradaStr = formData.get("horaEntrada") as string;
    const horaSalidaStr = formData.get("horaSalida") as string;
    const tiempoDescansoStr = formData.get("tiempoDescanso") as string;
    const observaciones = formData.get("observaciones") as string;

    if (!fechaStr || !horaEntradaStr || !horaSalidaStr) {
        return { error: "Campos obligatorios faltantes" };
    }

    const [year, month, day] = fechaStr.split('-').map(Number);
    const [hEntrada, mEntrada] = horaEntradaStr.split(':').map(Number);
    const [hSalida, mSalida] = horaSalidaStr.split(':').map(Number);

    const fecha = new Date(Date.UTC(year, month - 1, day));
    const horaEntrada = new Date(Date.UTC(year, month - 1, day, hEntrada, mEntrada));
    const horaSalida = new Date(Date.UTC(year, month - 1, day, hSalida, mSalida));
    
    if (horaSalida < horaEntrada) {
        horaSalida.setDate(horaSalida.getDate() + 1);
    }

    const tiempoDescanso = parseInt(tiempoDescansoStr) || 0;

    const turnoOwner = await prisma.usuario.findUnique({
        where: { id: existingTurno.usuarioId, tenantId: PSYCHOLOGY_TENANT_ID },
        include: { CuentasPago: true }
    });

    const diffMs = horaSalida.getTime() - horaEntrada.getTime();
    let hoursWorked = diffMs / (1000 * 60 * 60); 
    const breakHours = tiempoDescanso / 60; 
    hoursWorked -= breakHours;

    if (hoursWorked < 0) hoursWorked = 0;
    hoursWorked = Math.round(hoursWorked * 100) / 100;

    const valorHora = turnoOwner?.CuentasPago?.[0]?.valorHora || 0;
    const valorTotal = hoursWorked * valorHora;

    await prisma.turno.update({
      where: { id, tenantId: PSYCHOLOGY_TENANT_ID, usuarioId: payload.userId, cuentaCobroId: null },
      data: {
        fecha,
        horaEntrada,
        horaSalida,
        tiempoDescanso,
        observaciones,
        valorTotal,
      },
    });

    revalidatePath("/dashboard/contabilidad/cuenta-cobro");
    return { success: true, message: "Turno actualizado exitosamente" };
  } catch (error) {
    console.error("Error actualizando turno:", error);
    return { error: "Error al actualizar el turno" };
  }
}

export async function deleteTurno(token: string, id: number) {
    const payload = await verifyToken(token);
  
    if (!payload) {
      return { error: "No autorizado" };
    }
  
    try {
      const usuario = await prisma.usuario.findUnique({
        where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
        select: { tenantId: true, rol: true },
      });
  
      if (!usuario) {
        return { error: "Usuario no encontrado" };
      }

      
      const where = { 
        id, 
        tenantId: PSYCHOLOGY_TENANT_ID,
        usuarioId: payload.userId,
        cuentaCobroId: null,
      };
  
      const deleted = await prisma.turno.deleteMany({
        where,
      });
      if (deleted.count !== 1) return { error: "Turno no encontrado o perteneciente a un periodo cerrado" };
  
      revalidatePath("/dashboard/contabilidad/cuenta-cobro");
      return { success: true, message: "Registro eliminado exitosamente" };
    } catch (error) {
      console.error("Error eliminando turno:", error);
      return { error: "Error al eliminar el registro" };
    }
  }

export async function createCuentaCobroGroup(token: string) {
    const payload = await verifyToken(token);

    if (!payload) {
        return { error: "No autorizado" };
    }

    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
            select: { tenantId: true },
        });

        if (!usuario) {
            return { error: "Usuario no encontrado" };
        }

        // 1. Get all unassigned turnos
        const turnos = await prisma.turno.findMany({
            where: {
                tenantId: PSYCHOLOGY_TENANT_ID,
                usuarioId: payload.userId,
                cuentaCobroId: null,
            },
            orderBy: { fecha: 'asc' }
        });

        if (turnos.length === 0) {
            return { error: "No hay turnos pendientes para cerrar periodo" };
        }

        // 2. Calculate totals
        const fechaInicio = turnos[0].fecha;
        const fechaFin = turnos[turnos.length - 1].fecha;
        const valorTotal = turnos.reduce((acc, t) => acc + (t.valorTotal || 0), 0);

        // 3. Create CuentaCobro and update Turnos in a transaction
        await prisma.$transaction(async (tx) => {
            const cuentaCobro = await tx.cuentaCobro.create({
                data: {
                    tenantId: PSYCHOLOGY_TENANT_ID,
                    usuarioId: payload.userId,
                    fechaInicio,
                    fechaFin,
                    valorTotal,
                    estado: "GENERADA"
                }
            });

            const assigned = await tx.turno.updateMany({
                where: {
                    id: { in: turnos.map(t => t.id) },
                    tenantId: PSYCHOLOGY_TENANT_ID,
                    usuarioId: payload.userId,
                    cuentaCobroId: null,
                },
                data: {
                    cuentaCobroId: cuentaCobro.id
                }
            });
            if (assigned.count !== turnos.length) throw new Error("Los turnos cambiaron. Actualiza la página antes de cerrar el periodo.");
        });

        revalidatePath("/dashboard/contabilidad/cuenta-cobro");
        return { success: true, message: "Periodo cerrado exitosamente" };

    } catch (error) {
        console.error("Error creando cuenta de cobro:", error);
        return { error: "Error al cerrar el periodo" };
    }
}

export async function getCuentasCobro(token: string) {
    const payload = await verifyToken(token);

    if (!payload) {
        return { error: "No autorizado" };
    }

    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
            select: { tenantId: true, rol: true },
        });

        if (!usuario) {
            return { error: "Usuario no encontrado" };
        }

        const cuentas = await prisma.cuentaCobro.findMany({
            where: accountAccessWhere(payload.userId, usuario.rol),
            orderBy: {
                createdAt: "desc",
            },
            include: {
                _count: {
                    select: { turnos: { where: { tenantId: PSYCHOLOGY_TENANT_ID } } }
                },
                usuario: {
                    select: {
                        nombre: true,
                        apellido: true
                    }
                }
            }
        });

        return { cuentas };
    } catch (error) {
        console.error("Error obteniendo cuentas:", error);
        return { error: "Error al cargar el historial" };
    }
}

export async function getCuentaCobroDetails(token: string, cuentaId: number) {
    const payload = await verifyToken(token);

    if (!payload) {
        return { error: "No autorizado" };
    }

    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
            select: { tenantId: true, rol: true },
        });

        if (!usuario) {
            return { error: "Usuario no encontrado" };
        }

        const turnos = await prisma.turno.findMany({
            where: {
                ...accountAccessWhere(payload.userId, usuario.rol),
                cuentaCobroId: cuentaId,
                cuentaCobro: { tenantId: PSYCHOLOGY_TENANT_ID },
            },
            select: {
                id: true,
                tenantId: true,
                usuarioId: true,
                fecha: true,
                horaEntrada: true,
                horaSalida: true,
                tiempoDescanso: true,
                observaciones: true,
                createdAt: true,
                valorTotal: true,
                fotoEntrada: true,
                fotoSalida: true,
                cuentaCobroId: true,
                usuario: {
                    select: {
                        nombre: true,
                        apellido: true
                    }
                }
            },
            orderBy: {
                fecha: "desc"
            }
        });

        return { turnos };
    } catch (error) {
        console.error("Error obteniendo detalles:", error);
        return { error: "Error al cargar detalles" };
    }
}

export async function getCuentaCobroPdfData(token: string, cuentaId: number) {
    const payload = await verifyToken(token);

    if (!payload) {
        return { error: "No autorizado" };
    }

    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
            select: { tenantId: true, rol: true },
        });

        if (!usuario) {
            return { error: "Usuario no encontrado" };
        }

        const cuenta = await prisma.cuentaCobro.findFirst({
            where: {
                id: cuentaId,
                ...accountAccessWhere(payload.userId, usuario.rol),
            },
            include: {
                usuario: {
                    select: {
                        nombre: true,
                        apellido: true,
                        numeroDocumento: true,
                        telefono: true,
                        CuentasPago: {
                             select: {
                                banco: true,
                                tipoCuenta: true,
                                numeroCuenta: true
                             },
                             take: 1
                        }
                    }
                },
                turnos: {
                    where: { tenantId: PSYCHOLOGY_TENANT_ID, usuario: { tenantId: PSYCHOLOGY_TENANT_ID } },
                    orderBy: {
                        fecha: 'asc'
                    }
                }
            }
        });

        if (!cuenta) {
            return { error: "Cuenta de cobro no encontrada" };
        }

        if (!isAccountAdmin(usuario.rol) && cuenta.usuarioId !== payload.userId) {
            return { error: "No autorizado" };
        }

        return { cuenta };
    } catch (error) {
        console.error("Error obteniendo datos para PDF:", error);
        return { error: "Error al cargar datos" };
    }
}

export async function sendCuentaCobro(token: string, cuentaId: number) {
    const payload = await verifyToken(token);

    if (!payload) {
        return { error: "No autorizado" };
    }

    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
            select: { tenantId: true },
        });

        if (!usuario) {
            return { error: "Usuario no encontrado" };
        }

        const cuenta = await prisma.cuentaCobro.findFirst({
            where: { id: cuentaId, tenantId: PSYCHOLOGY_TENANT_ID, usuarioId: payload.userId, estado: "GENERADA", usuario: { tenantId: PSYCHOLOGY_TENANT_ID } }
        });

        if (!cuenta) {
            return { error: "Cuenta de cobro no encontrada" };
        }

        if (cuenta.usuarioId !== payload.userId) {
            return { error: "No autorizado para enviar esta cuenta de cobro" };
        }

        await prisma.cuentaCobro.update({
            where: { id: cuentaId, tenantId: PSYCHOLOGY_TENANT_ID, usuarioId: payload.userId, estado: "GENERADA" },
            data: {
                estado: "PENDIENTE"
            }
        });

        revalidatePath("/dashboard/contabilidad/cuenta-cobro");
        return { success: true, message: "Cuenta de cobro enviada exitosamente" };

    } catch (error) {
        console.error("Error enviando cuenta de cobro:", error);
        return { error: "Error al enviar la cuenta de cobro" };
    }
}

export async function updateCuentaCobroStatus(token: string, cuentaId: number, estado: "PAGADA" | "RECHAZADA") {
    const payload = await verifyToken(token);

    if (!payload) {
        return { error: "No autorizado" };
    }

    try {
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
            select: { tenantId: true, rol: true }, // Need rol to verify permission if strict check needed
        });

        if (!usuario) {
            return { error: "Usuario no encontrado" };
        }

        if (!isAccountAdmin(usuario.rol)) {
             return { error: "No tienes permisos para realizar esta acción" };
        }
        if (estado !== "PAGADA" && estado !== "RECHAZADA") return { error: "Estado inválido" };

        await prisma.cuentaCobro.update({
            where: { id: cuentaId, tenantId: PSYCHOLOGY_TENANT_ID, estado: "PENDIENTE", usuario: { tenantId: PSYCHOLOGY_TENANT_ID } },
            data: { estado }
        });

        revalidatePath("/dashboard/contabilidad/cuenta-cobro");
        return { success: true, message: `Cuenta de cobro marcada como ${estado.toLowerCase()}` };

    } catch (error) {
        console.error("Error actualizando estado de cuenta:", error);
        return { error: "Error al actualizar el estado" };
    }
}

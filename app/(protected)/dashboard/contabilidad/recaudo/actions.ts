"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createAuditLog } from "@/lib/audit";
import { createClient } from "@supabase/supabase-js";

// --- Types ---

export interface TechnicianFinancialStatus {
  id: number;
  nombre: string;
  apellido: string;
  saldoPendiente: number;
  ultimaTransferencia: Date | null;
  diasSinTransferir: number;
  ordenesPendientesCount: number;
}

export interface PendingOrder {
  id: number;
  numeroOrden: string | null;
  clienteNombre: string;
  direccion: string;
  fechaVisita: Date | null;
  valorPagado: number;
  servicio: string;
}

// --- Actions ---

export async function getTechniciansFinancialStatus(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    // 1. Obtener todos los técnicos activos del tenant
    const tecnicos = await prisma.usuario.findMany({
      where: {
        tenantId: usuario.tenantId,
        rol: "TECNICO",
        activo: true,
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
      },
      orderBy: { nombre: "asc" },
    });

    const tecnicoIds = tecnicos.map((t) => t.id);

    // 2. Agregar saldo pendiente (Efectivo y NO Conciliado)
    // Asumimos MetodoPago ID 1 = Efectivo.
    // Estados de pago pendientes: PENDIENTE, EFECTIVO_DECLARADO, CONSIGNADO (si aun no se ha conciliado/validado administrativamente, aunque CONSIGNADO suele implicar que ya hay un registro de consignación, aquí buscamos lo que falta por procesar.
    // Si el flujo es: Tecnico pone "Efectivo" -> EstadoPago = PENDIENTE/EFECTIVO_DECLARADO.
    // Cuando el admin registra la consignación -> EstadoPago = CONCILIADO.
    const saldoAggregations = await prisma.ordenServicio.groupBy({
      by: ["tecnicoId"],
      where: {
        tenantId: usuario.tenantId,
        tecnicoId: { in: tecnicoIds },
        metodoPagoId: 1, // Efectivo
        estadoPago: { not: "CONCILIADO" }, 
        estadoServicio: {
           AND: [
             { nombre: { not: { contains: "Cancelado" } } },
             { nombre: { not: { contains: "No Concretado" } } },
             { nombre: { not: { contains: "Proceso" } } },
             { nombre: { not: { contains: "Programado" } } },
             { nombre: { not: { contains: "Agendado" } } },
             { nombre: { not: { contains: "Nuevo" } } },
           ]
        }
      },
      _sum: {
        valorPagado: true,
      },
      _count: {
        id: true,
      },
    });

    // 3. Obtener última fecha de consignación
    const lastConsignations = await prisma.consignacionEfectivo.groupBy({
      by: ["tecnicoId"],
      where: {
        tenantId: usuario.tenantId,
        tecnicoId: { in: tecnicoIds },
      },
      _max: {
        fechaConsignacion: true,
      },
    });

    // 4. Mezclar datos en memoria
    const statusList: TechnicianFinancialStatus[] = tecnicos.map((tecnico) => {
      const saldoData = saldoAggregations.find((s) => s.tecnicoId === tecnico.id);
      const consignacionData = lastConsignations.find((c) => c.tecnicoId === tecnico.id);

      const ultimaFecha = consignacionData?._max.fechaConsignacion || null;
      let diasSinTransferir = 0;

      if (ultimaFecha) {
        const diffTime = Math.abs(new Date().getTime() - new Date(ultimaFecha).getTime());
        diasSinTransferir = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      } else if (saldoData && saldoData._sum.valorPagado && saldoData._sum.valorPagado.toNumber() > 0) {
        // Si tiene saldo pero nunca ha transferido, contamos desde "siempre" o un valor alto/alerta
        diasSinTransferir = 999;
      }

      return {
        id: tecnico.id,
        nombre: tecnico.nombre,
        apellido: tecnico.apellido,
        saldoPendiente: saldoData?._sum.valorPagado?.toNumber() || 0,
        ordenesPendientesCount: saldoData?._count.id || 0,
        ultimaTransferencia: ultimaFecha,
        diasSinTransferir: diasSinTransferir,
      };
    });

    // Ordenar por saldo descendente para priorizar cobro
    return { 
      data: statusList.sort((a, b) => b.saldoPendiente - a.saldoPendiente) 
    };

  } catch (error) {
    console.error("Error getTechniciansFinancialStatus:", error);
    return { error: "Error al cargar el estado financiero de los técnicos" };
  }
}

export async function getPendingCashOrders(token: string, tecnicoId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const ordenes = await prisma.ordenServicio.findMany({
      where: {
        tenantId: usuario.tenantId,
        tecnicoId: tecnicoId,
        metodoPagoId: 1, // Efectivo
        estadoPago: { not: "CONCILIADO" },
        estadoServicio: {
           AND: [
             { nombre: { not: { contains: "Cancelado" } } },
             { nombre: { not: { contains: "No Concretado" } } },
             { nombre: { not: { contains: "Proceso" } } },
             { nombre: { not: { contains: "Programado" } } },
             { nombre: { not: { contains: "Agendado" } } },
             { nombre: { not: { contains: "Nuevo" } } },
           ]
        }
      },
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
          }
        },
        servicio: {
          select: {
            nombre: true
          }
        }
      },
      orderBy: {
        fechaVisita: "asc"
      }
    });

    const formattedOrders: PendingOrder[] = ordenes.map(o => ({
      id: o.id,
      numeroOrden: o.numeroOrden,
      clienteNombre: `${o.cliente.nombre} ${o.cliente.apellido}`,
      direccion: o.direccionTexto,
      fechaVisita: o.fechaVisita,
      valorPagado: o.valorPagado?.toNumber() || 0,
      servicio: o.servicio.nombre
    }));

    return { ordenes: formattedOrders };

  } catch (error) {
    console.error("Error getPendingCashOrders:", error);
    return { error: "Error al cargar órdenes pendientes" };
  }
}

export async function registerConsignation(
  token: string,
  tecnicoId: number,
  data: {
    monto: number;
    adelanto: number;
    banco: string;
    referencia: string; // Puede ser opcional si es efectivo en mano
    fecha: Date;
    observacion?: string;
    ordenesIds: number[]; // IDs de las órdenes que cubre esta consignación
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

    // Calcular el total esperado de las órdenes seleccionadas
    const ordenesSeleccionadas = await prisma.ordenServicio.findMany({
      where: {
        id: { in: data.ordenesIds },
        tenantId: usuario.tenantId
      },
      select: { id: true, valorPagado: true }
    });

    const totalEsperado = ordenesSeleccionadas.reduce((sum, o) => sum + (o.valorPagado?.toNumber() || 0), 0);
    // La diferencia ahora contempla lo consignado + lo que se toma como adelanto
    const diferencia = (data.monto + data.adelanto) - totalEsperado;

    // Transacción Principal
    await prisma.$transaction(async (tx) => {
      // 1. Crear Registro de Consignación
      const consignacion = await tx.consignacionEfectivo.create({
        data: {
          tenantId: usuario.tenantId,
          tecnicoId: tecnicoId,
          fechaConsignacion: data.fecha,
          valorConsignado: data.monto,
          referenciaBanco: data.referencia || "EFECTIVO_OFICINA",
          comprobantePath: data.comprobantePath || "PENDIENTE_UPLOAD", 
          estado: "VALIDADA",
          diferencia: diferencia,
          observacion: data.observacion,
          creadoPorId: payload.userId,
        }
      });

      // 2. Si hay un monto de adelanto, crear el registro de Anticipo vinculado
      if (data.adelanto > 0) {
        await tx.anticipos.create({
          data: {
            tenantId: usuario.tenantId,
            usuarioId: tecnicoId,
            monto: data.adelanto,
            razon: `Descuento por recaudo incompleto en consignación #${consignacion.id}`,
            created_at: data.fecha,
            consignacionId: consignacion.id
          }
        });
      }

      // 3. Crear Relaciones (ConsignacionOrden)
      if (data.ordenesIds.length > 0) {
        await tx.consignacionOrden.createMany({
          data: data.ordenesIds.map(ordenId => ({
            consignacionId: consignacion.id,
            ordenId: ordenId
          }))
        });

        // 4. Actualizar estado de las órdenes a CONCILIADO
        await tx.ordenServicio.updateMany({
          where: {
            id: { in: data.ordenesIds }
          },
          data: {
            estadoPago: "CONCILIADO"
          }
        });
      }
      
      // Audit Log
      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "CREATE",
        entidad: "ConsignacionEfectivo",
        entidadId: consignacion.id,
        detalles: {
          descripcion: "Registro de consignación de efectivo con posible adelanto",
          montoConsignado: data.monto,
          montoAdelanto: data.adelanto,
          ordenesCubiertas: data.ordenesIds.length,
          diferenciaFinal: diferencia
        },
        tx
      });
    });

    revalidatePath("/dashboard/contabilidad/recaudo");
    return { success: true, message: "Consignación registrada correctamente" };

  } catch (error) {
    console.error("Error registerConsignation:", error);
    return { error: "Error al registrar la consignación" };
  }
}

export async function registerAdvanceFromOrders(
  token: string,
  tecnicoId: number,
  data: {
    monto: number;
    ordenesIds: number[];
    razon: string;
    fecha: Date;
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

    await prisma.$transaction(async (tx) => {
      // 1. Create Anticipo
      await tx.anticipos.create({
        data: {
          tenantId: usuario.tenantId,
          usuarioId: tecnicoId,
          monto: data.monto,
          razon: data.razon,
          created_at: data.fecha,
        },
      });

      // 2. Update OrdenServicio status to CONCILIADO
      if (data.ordenesIds.length > 0) {
        await tx.ordenServicio.updateMany({
          where: {
            id: { in: data.ordenesIds },
            tenantId: usuario.tenantId,
          },
          data: {
            estadoPago: "CONCILIADO",
          },
        });
      }

      // 3. Audit Log
      await createAuditLog({
        tenantId: usuario.tenantId,
        usuarioId: payload.userId,
        accion: "CREATE",
        entidad: "Anticipos",
        entidadId: "0", // ID is BigInt, simplified for log or we can fetch it.
        detalles: {
          descripcion: "Anticipo generado desde recaudo de servicios",
          monto: data.monto,
          ordenesCubiertas: data.ordenesIds.length,
          razon: data.razon,
        },
        tx,
      });
    });

    revalidatePath("/dashboard/contabilidad/recaudo");
    revalidatePath("/dashboard/contabilidad/anticipos");
    return { success: true, message: "Anticipo registrado correctamente" };
  } catch (error) {
    console.error("Error registerAdvanceFromOrders:", error);
    return { error: "Error al registrar el anticipo" };
  }
}

export async function uploadConsignationProof(token: string, formData: FormData) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const file = formData.get("file") as File;
    if (!file) return { error: "No se recibió archivo" };

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const fileExt = file.name.split(".").pop();
    const fileName = `consignacion-${usuario.tenantId}-${Date.now()}.${fileExt}`;
    const filePath = `${usuario.tenantId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("comprobantePago")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      return { error: "Error al subir a Supabase" };
    }

    return { path: filePath };

  } catch (error) {
    console.error("Error uploadConsignationProof:", error);
    return { error: "Error al subir el comprobante" };
  }
}

// --- History & Management Actions ---

export interface ConsignacionHistoryItem {
  id: number;
  tecnicoNombre: string;
  fecha: Date;
  valor: number;
  banco: string;
  referencia: string;
  estado: string;
  diferencia: number | null;
  observacion: string | null;
  comprobantePath: string | null;
  servicios?: { id: number; numeroOrden: string | null; valor: number }[];
}

export interface DeclaracionHistoryItem {
  id: number;
  tecnicoNombre: string;
  ordenNumero: string | null;
  fecha: Date;
  valor: number;
  observacion: string | null;
  consignado: boolean;
  evidenciaPath: string;
}

export async function getConsignacionHistory(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const consignaciones = await prisma.consignacionEfectivo.findMany({
      where: {
        tenantId: usuario.tenantId,
      },
      select: {
        id: true,
        fechaConsignacion: true,
        valorConsignado: true,
        referenciaBanco: true,
        estado: true,
        diferencia: true,
        observacion: true,
        comprobantePath: true,
        tecnico: {
          select: {
            nombre: true,
            apellido: true,
          }
        },
        ordenes: {
          select: {
            orden: {
              select: {
                id: true,
                numeroOrden: true,
                valorPagado: true,
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit to last 100 for performance, maybe add pagination later
    });

    const formatted: ConsignacionHistoryItem[] = consignaciones.map(c => ({
      id: c.id,
      tecnicoNombre: `${c.tecnico.nombre} ${c.tecnico.apellido}`,
      fecha: c.fechaConsignacion,
      valor: c.valorConsignado.toNumber(),
      banco: c.referenciaBanco, // reusing field for bank/ref combo usually
      referencia: c.referenciaBanco,
      estado: c.estado,
      diferencia: c.diferencia ? c.diferencia.toNumber() : null,
      observacion: c.observacion,
      comprobantePath: c.comprobantePath,
      servicios: c.ordenes.map(o => ({
        id: o.orden.id,
        numeroOrden: o.orden.numeroOrden,
        valor: o.orden.valorPagado?.toNumber() || 0
      }))
    }));

    return { data: formatted };

  } catch (error) {
    console.error("Error getConsignacionHistory:", error);
    return { error: "Error al cargar historial de consignaciones" };
  }
}

export async function getDeclaracionHistory(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    const declaraciones = await prisma.declaracionEfectivo.findMany({
      where: {
        tenantId: usuario.tenantId,
      },
      select: {
        id: true,
        fechaDeclaracion: true,
        valorDeclarado: true,
        observacion: true,
        consignado: true,
        evidenciaPath: true,
        tecnico: {
          select: {
            nombre: true,
            apellido: true,
          }
        },
        orden: {
          select: {
            numeroOrden: true,
            id: true // fallback if numeroOrden is null
          }
        }
      },
      orderBy: {
        fechaDeclaracion: 'desc'
      },
      take: 100
    });

    const formatted: DeclaracionHistoryItem[] = declaraciones.map(d => ({
      id: d.id,
      tecnicoNombre: `${d.tecnico.nombre} ${d.tecnico.apellido}`,
      ordenNumero: d.orden.numeroOrden || `ORD-${d.orden.id}`,
      fecha: d.fechaDeclaracion,
      valor: d.valorDeclarado.toNumber(),
      observacion: d.observacion,
      consignado: d.consignado,
      evidenciaPath: d.evidenciaPath
    }));

    return { data: formatted };

  } catch (error) {
    console.error("Error getDeclaracionHistory:", error);
    return { error: "Error al cargar historial de declaraciones" };
  }
}

export async function updateConsignacion(
  token: string, 
  id: number, 
  data: { 
    estado?: "PENDIENTE" | "VALIDADA" | "OBSERVADA"; 
    observacion?: string;
    fecha?: Date;
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

    await prisma.consignacionEfectivo.update({
      where: {
        id: id,
        tenantId: usuario.tenantId // Security check
      },
      data: {
        ...(data.estado && { estado: data.estado }),
        ...(data.observacion !== undefined && { observacion: data.observacion }),
        ...(data.fecha && { fechaConsignacion: data.fecha }),
      }
    });

    revalidatePath("/dashboard/contabilidad/recaudo");
    return { success: true, message: "Consignación actualizada" };

  } catch (error) {
    console.error("Error updateConsignacion:", error);
    return { error: "Error al actualizar consignación" };
  }
}

export async function updateDeclaracion(
  token: string, 
  id: number, 
  data: { observacion?: string; consignado?: boolean }
) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    await prisma.declaracionEfectivo.update({
      where: {
        id: id,
        tenantId: usuario.tenantId // Security check
      },
      data: {
        ...(data.consignado !== undefined && { consignado: data.consignado }),
        ...(data.observacion !== undefined && { observacion: data.observacion }),
      }
    });

    revalidatePath("/dashboard/contabilidad/recaudo");
    return { success: true, message: "Declaración actualizada" };

  } catch (error) {
    console.error("Error updateDeclaracion:", error);
    return { error: "Error al actualizar declaración" };
  }
}

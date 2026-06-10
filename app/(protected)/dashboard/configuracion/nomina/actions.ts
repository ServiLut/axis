"use server";

import prisma from "@/lib/prisma"; // Changed from named import to default to match existing pattern if needed, or check lib/prisma.ts
import { revalidatePath } from "next/cache";
import { verifyToken } from "@/lib/auth";
import { Prisma } from "@/prisma/generated/prisma/client";

// Schema de validación
type TipoPagoNomina = "PORCENTAJE" | "SALARIO_FIJO";

export interface NominaFormData {
  usuarioId: number;
  tipo: TipoPagoNomina;
  valorParticipacion?: number;
  salarioBase?: number;
}

const validateNominaData = (data: NominaFormData): NominaFormData | null => {
  if (!Number.isInteger(data.usuarioId) || data.usuarioId <= 0) return null;
  if (data.tipo !== "PORCENTAJE" && data.tipo !== "SALARIO_FIJO") return null;

  const valorParticipacion =
    data.valorParticipacion === undefined ? undefined : Number(data.valorParticipacion);
  const salarioBase =
    data.salarioBase === undefined ? undefined : Number(data.salarioBase);

  if (
    valorParticipacion !== undefined &&
    (!Number.isFinite(valorParticipacion) ||
      valorParticipacion < 0 ||
      valorParticipacion > 100)
  ) {
    return null;
  }

  if (
    salarioBase !== undefined &&
    (!Number.isFinite(salarioBase) || salarioBase < 0)
  ) {
    return null;
  }

  return {
    usuarioId: data.usuarioId,
    tipo: data.tipo,
    valorParticipacion,
    salarioBase,
  };
};

export async function getUsuariosNomina(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };
  
  try {
    // Obtenemos el usuario fresco de la BD para asegurar el tenantId actual y el rol
    const currentUser = await prisma.usuario.findUnique({
        where: { id: payload.userId },
        select: { tenantId: true, rol: true }
    });

    if (!currentUser) return { error: "Usuario no encontrado" };

    const whereClause: Prisma.UsuarioWhereInput = {
      rol: {
        in: ["TECNICO", "ASESOR", "ADMIN"], 
      },
      activo: true,
    };

    // Si NO es SU_ADMIN, filtramos por su tenant actual
    if (currentUser.rol !== 'SU_ADMIN') {
      whereClause.tenantId = currentUser.tenantId;
    }

    const usuarios = await prisma.usuario.findMany({
      where: whereClause,
      select: {
        id: true,
        nombre: true,
        apellido: true,
        rol: true,
        email: true,
        empresa: {
          select: {
            nombre: true
          }
        },
        ConfiguracionPagos: {
          take: 1, // Tomamos la más reciente o única
          orderBy: {
            created_at: 'desc'
          }
        },
      },
      orderBy: {
        nombre: 'asc',
      }
    });

    // Mapeamos para facilitar el consumo en el front
    const data = usuarios.map(u => ({
        id: u.id,
        nombre: `${u.nombre} ${u.apellido}`,
        email: u.email,
        rol: u.rol,
        empresaName: u.empresa?.nombre || "Sin Empresa",
        configuracion: u.ConfiguracionPagos[0] || null
    }));

    return { success: true, data };
  } catch (error) {
    console.error("Error fetching nomina users:", error);
    return { error: "Error al cargar usuarios" };
  }
}

export async function saveConfiguracionNomina(token: string, data: NominaFormData) {
   const payload = verifyToken(token);
   if (!payload) return { error: "No autorizado" };

   const parsed = validateNominaData(data);
   if (!parsed) return { error: "Datos inválidos" };

   const { usuarioId, tipo, valorParticipacion, salarioBase } = parsed;

   try {
     // Verificamos si ya existe una configuración para actualizarla o crear una nueva
     const existingConfig = await prisma.configuracionPagos.findFirst({
        where: { usuarioId }
     });

     if (existingConfig) {
        await prisma.configuracionPagos.update({
            where: { id: existingConfig.id },
            data: {
                tipo,
                valorParticipacion: tipo === 'PORCENTAJE' ? valorParticipacion : null,
                salarioBase: tipo === 'SALARIO_FIJO' ? salarioBase : null,
            }
        });
     } else {
        try {
            await prisma.configuracionPagos.create({
                data: {
                    usuarioId,
                    tipo,
                    valorParticipacion: tipo === 'PORCENTAJE' ? valorParticipacion : null,
                    salarioBase: tipo === 'SALARIO_FIJO' ? salarioBase : null,
                }
            });
        } catch (createError: unknown) {
            if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === 'P2002') {
                // Sequence out of sync fix
                try {
                     // Attempt to fix sequence for "ConfiguracionPagos"
                     await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('"ConfiguracionPagos"', 'id'), coalesce(max(id)+1, 1), false) FROM "ConfiguracionPagos";`;
                     
                     // Retry create
                     await prisma.configuracionPagos.create({
                        data: {
                            usuarioId,
                            tipo,
                            valorParticipacion: tipo === 'PORCENTAJE' ? valorParticipacion : null,
                            salarioBase: tipo === 'SALARIO_FIJO' ? salarioBase : null,
                        }
                    });
                } catch (retryError) {
                    console.error("Failed to retry creation after sequence fix:", retryError);
                    throw createError; // Throw original error if fix fails
                }
            } else {
                throw createError;
            }
        }
     }

     revalidatePath("/dashboard/configuracion/nomina");
     return { success: true };

   } catch (error) {
     console.error("Error saving nomina config:", error);
     return { error: "Error al guardar configuración" };
   }
}

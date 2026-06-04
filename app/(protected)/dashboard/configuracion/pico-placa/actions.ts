'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { verifyToken } from '@/lib/auth';

export interface TecnicoPicoPlaca {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  placa: string | null;
  moto: boolean | null;
  tienePicoPlaca: boolean;
  digitosRestringidos: string; // "1 - 2"
}

export async function getPicoPlacaRules(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: 'No autorizado' };

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true }
    });
    if (!user) return { error: 'Usuario no encontrado' };

    const rules = await prisma.picoPlaca.findMany({
      where: { tenantId: user.tenantId, activo: true },
      orderBy: { id: 'asc' },
    });

    return { data: rules };
  } catch (error) {
    console.error('Error rules:', error);
    return { error: 'Error al cargar reglas' };
  }
}

// Actualización batch para las reglas (para el nuevo modal)
export async function updatePicoPlacaRulesBatch(token: string, rules: { dia: string; n1: number | null; n2: number | null }[]) {
  const payload = verifyToken(token);
  if (!payload) return { error: 'No autorizado' };

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true }
    });
    if (!user) return { error: 'Usuario no encontrado' };
    const tenantId = user.tenantId;

    await prisma.$transaction(async (tx) => {
      for (const r of rules) {
        const existing = await tx.picoPlaca.findFirst({
            where: { tenantId, dia: r.dia }
        });

        if (existing) {
            await tx.picoPlaca.update({
                where: { id: existing.id },
                data: { numeroUno: r.n1, numeroDos: r.n2 }
            });
        } else {
            await tx.picoPlaca.create({
                data: {
                    tenantId,
                    dia: r.dia,
                    numeroUno: r.n1,
                    numeroDos: r.n2,
                    activo: true
                }
            });
        }
      }
    });

    revalidatePath('/dashboard/configuracion/pico-placa');
    return { success: true };
  } catch (error) {
    console.error('Error updating rules batch:', error);
    return { error: 'Error al guardar reglas' };
  }
}

// Actualizar vehículo de usuario
export async function updateUsuarioVehiculo(token: string, userId: number, placa: string | null, isMoto: boolean) {
    const payload = verifyToken(token);
    if (!payload) return { error: 'No autorizado' };

    try {
        // Validar que el usuario que edita pertenece al mismo tenant que el editado
        // O simplificar: solo validar que quien edita tiene permisos.
        const admin = await prisma.usuario.findUnique({
            where: { id: payload.userId },
            select: { tenantId: true }
        });
        if (!admin) return { error: 'Usuario administrador no encontrado' };

        const targetUser = await prisma.usuario.findUnique({
            where: { id: userId },
            select: { tenantId: true }
        });

        if (!targetUser) return { error: 'Técnico no encontrado' };
        if (targetUser.tenantId !== admin.tenantId) return { error: 'No autorizado' };

        await prisma.usuario.update({
            where: { id: userId },
            data: {
                placa: placa ? placa.toUpperCase().trim() : null,
                moto: isMoto
            }
        });
        
        revalidatePath('/dashboard/configuracion/pico-placa');
        return { success: true };

    } catch (error) {
        console.error('Error updating vehicle:', error);
        return { error: 'Error al actualizar vehículo' };
    }
}


export async function getTecnicosStatus(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: 'No autorizado' };

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true }
    });
    if (!user) return { error: 'Usuario no encontrado' };
    const tenantId = user.tenantId;

    // 1. Obtener Técnicos
    const tecnicos = await prisma.usuario.findMany({
      where: {
        tenantId,
        rol: { in: ['TECNICO', 'ADMIN', 'SU_ADMIN'] }, // Incluimos admins que puedan tener moto/carro
        activo: true,
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        telefono: true,
        placa: true,
        moto: true,
      }
    });

    // 2. Determinar Día Actual (Servidor)
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayIndex = new Date().getDay();
    const todayName = days[todayIndex];

    // 3. Obtener Regla de Hoy
    const rule = await prisma.picoPlaca.findFirst({
      where: {
        tenantId,
        dia: todayName,
        activo: true,
      }
    });

    // 4. Mapear estado
    const result: TecnicoPicoPlaca[] = tecnicos.map(t => {
      const isMoto = t.moto === true;
      let tienePicoPlaca = false;
      let digitos = "No aplica";

      if (rule && rule.numeroUno !== null && rule.numeroDos !== null && t.placa) {
        digitos = `${rule.numeroUno} - ${rule.numeroDos}`;
        
        // Lógica Medellín:
        // Carros: Último dígito
        // Motos: Primer dígito
        
        const placaLimpia = t.placa.trim().toUpperCase();
        const digitosPlaca = placaLimpia.replace(/\D/g, '');
        
        if (digitosPlaca.length > 0) {
            let digitoComparar = -1;
            
            if (isMoto) {
                 // Motos: PRIMER número de la placa
                 digitoComparar = parseInt(digitosPlaca[0]);
            } else {
                 // Carros: ÚLTIMO número de la placa
                 digitoComparar = parseInt(digitosPlaca[digitosPlaca.length - 1]);
            }

            if (digitoComparar === rule.numeroUno || digitoComparar === rule.numeroDos) {
                tienePicoPlaca = true;
            }
        }
      } else if (rule && rule.numeroUno !== null) {
          digitos = `${rule.numeroUno} - ${rule.numeroDos}`;
      }

      return {
        id: t.id,
        nombre: t.nombre || '',
        apellido: t.apellido || '',
        email: t.email,
        telefono: t.telefono,
        placa: t.placa,
        moto: t.moto,
        tienePicoPlaca,
        digitosRestringidos: digitos
      };
    });

    // Ordenar: Primero los que tienen Pico y Placa
    result.sort((a, b) => (a.tienePicoPlaca === b.tienePicoPlaca ? 0 : a.tienePicoPlaca ? -1 : 1));

    return { data: result, today: todayName };

  } catch (error) {
    console.error('Error status:', error);
    return { error: 'Error al cargar estados' };
  }
}
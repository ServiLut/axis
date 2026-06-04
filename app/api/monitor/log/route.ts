import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Función auxiliar para log de debug
const debugLog = (msg: string) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[MONITOR] ${msg}`);
  }
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, tipo, ruta, detalles } = body;

    debugLog(`Recibida petición: userId=${userId}, tipo=${tipo}`);

    if (!userId) {
      debugLog("Error: Missing userId");
      return NextResponse.json(
        { success: false, error: "Missing userId" },
        { status: 400 }
      );
    }

    // 1. Buscar sesión abierta de hoy (sin fechaFin)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let session = await prisma.sesionActividad.findFirst({
      where: {
        usuarioId: userId,
        fechaFin: null,
        fechaInicio: {
          gte: today,
        },
      },
    });

    // Si no existe, crearla
    if (!session) {
      debugLog("Creando nueva sesión...");
      const userAgent = request.headers.get("user-agent") || null;
      // Intento básico de obtener IP
      const forwarded = request.headers.get("x-forwarded-for");
      const ip = forwarded ? (typeof forwarded === 'string' ? forwarded.split(/, /)[0] : forwarded[0]) : null;

      try {
        session = await prisma.sesionActividad.create({
          data: {
            usuarioId: userId,
            dispositivo: userAgent,
            ip: ip,
          },
        });
        debugLog(`Sesión creada ID: ${session.id}`);
      } catch (createError: unknown) {
        const createErrorMessage = createError instanceof Error ? createError.message : String(createError);
        debugLog(`Error creando sesión: ${createErrorMessage}`);
        // Posible error si no se reinició el servidor y Prisma no conoce el modelo
        throw createError;
      }
    } else {
      debugLog(`Sesión existente encontrada ID: ${session.id}`);
    }

    // 2. Crear registro en LogEvento
    // Convertimos detalles a string si es objeto, para almacenarlo en descripcion
    let descripcionStr: string | null = null;
    if (detalles !== undefined && detalles !== null) {
      if (typeof detalles === 'object') {
        descripcionStr = JSON.stringify(detalles);
      } else {
        descripcionStr = String(detalles);
      }
    }

    await prisma.logEvento.create({
      data: {
        sesionId: session.id,
        tipo: tipo || "UNKNOWN",
        ruta: ruta || null,
        descripcion: descripcionStr,
      },
    });
    debugLog("Evento guardado correctamente");

    // 3. Si es inactividad, sumar tiempo
    if (tipo === "INACTIVIDAD_DETECTADA") {
      // Asumimos que 'detalles' contiene el tiempo a sumar (ej: en minutos o segundos, según convención del proyecto)
      // Si detalles es "5", se suman 5.
      const timeToAdd = parseInt(String(detalles), 10);
      
      if (!isNaN(timeToAdd) && timeToAdd > 0) {
        await prisma.sesionActividad.update({
          where: { id: session.id },
          data: {
            tiempoInactivo: {
              increment: timeToAdd,
            },
          },
        });
        debugLog(`Tiempo inactivo sumado: ${timeToAdd}`);
      }
    }

    // 4. Responder
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLog(`Error general en API: ${errorMessage}`);
    console.error("Error logging activity:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

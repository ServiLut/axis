import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// Función auxiliar para log de debug
const debugLog = (msg: string) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`[MONITOR-REPORT] ${msg}`);
  }
};

export async function GET(request: Request) {
  try {
    debugLog("Iniciando solicitud de reporte");
    
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const user = verifyToken(token);

    if (!user || (user.role !== "ADMIN" && user.role !== "SU_ADMIN")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    
    let startOfDay = new Date();
    let endOfDay = new Date();

    if (dateParam) {
       const [year, month, day] = dateParam.split("-").map(Number);
       startOfDay = new Date(year, month - 1, day);
       endOfDay = new Date(year, month - 1, day);
    }
    
    startOfDay.setHours(0, 0, 0, 0);
    endOfDay.setHours(23, 59, 59, 999);

    const allUsers = await prisma.usuario.findMany({
      where: {
        activo: true,
        rol: { in: ["SU_ADMIN", "ADMIN", "ASESOR"] },
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        username: true,
        rol: true,
      }
    });

    const userIds = allUsers.map(u => u.id);

    const activeSessions = await prisma.sesionActividad.findMany({
      where: {
        usuarioId: { in: userIds },
        fechaInicio: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        LogEvento: {
          orderBy: { createdAt: "desc" },
          take: 1, 
        },
      },
      orderBy: { fechaInicio: "desc" },
    });
    
    // Agrupar sesiones por usuario
    const userSessions = new Map<number, typeof activeSessions>();
    activeSessions.forEach(session => {
      if (!userSessions.has(session.usuarioId)) {
        userSessions.set(session.usuarioId, []);
      }
      userSessions.get(session.usuarioId)?.push(session);
    });

    const reportData = allUsers.map(u => {
      const sessions = userSessions.get(u.id);
      if (sessions && sessions.length > 0) {
        // sessions[0] es la más reciente
        const latestSession = sessions[0];
        const firstSession = sessions[sessions.length - 1]; // La primera del día
        
        // Calcular último cierre de sesión (Max fechaFin)
        let lastLogout: Date | null = null;
        sessions.forEach(s => {
            if (s.fechaFin) {
                if (!lastLogout || new Date(s.fechaFin) > new Date(lastLogout)) {
                    lastLogout = s.fechaFin;
                }
            }
        });

        // Determinar si está realmente activo (la sesión más reciente no tiene fechaFin)
        const isCurrentlyActive = latestSession.fechaFin === null;

        return {
          ...latestSession,
          id: latestSession.id,
          // Sobrescribimos fechaInicio con la PRIMERA del día para el reporte
          fechaInicio: firstSession.fechaInicio,
          // Enviamos lastLogout como fechaFin para mostrar el último cierre
          fechaFin: lastLogout, 
          // Campo auxiliar para saber si la sesión actual sigue abierta
          currentSessionActive: isCurrentlyActive,
          status: isCurrentlyActive ? "ONLINE" : "OFFLINE", // "ONLINE" visualmente si activo
          eventos: latestSession.LogEvento,
          usuario: u,
        };
      } else {
        return {
          id: -u.id,
          usuarioId: u.id,
          fechaInicio: null,
          fechaFin: null,
          currentSessionActive: false,
          tiempoInactivo: 0,
          usuario: u,
          eventos: [],
          status: "OFFLINE"
        };
      }
    });

    reportData.sort((a, b) => {
      if (a.status === "ONLINE" && b.status === "OFFLINE") return -1;
      if (a.status === "OFFLINE" && b.status === "ONLINE") return 1;
      return a.usuario.nombre.localeCompare(b.usuario.nombre);
    });

    return NextResponse.json({ success: true, data: reportData });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
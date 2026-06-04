import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { verifyToken } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const headersList = await headers();

    // 1. Intentar obtener el token estándar
    let token = headersList.get("authorization");

    // 2. Si falta, intentar header personalizado (útil para VPS/Nginx)
    if (!token) {
      token = headersList.get("x-auth-token");
    } else {
      // Remover prefijo 'Bearer ' si está presente
      token = token.split(" ")[1];
    }

    if (!token) return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ message: "Token inválido" }, { status: 401 });

    const body = await request.json();
    const { serviceId, urls } = body;

    if (!serviceId || !urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ message: "Faltan datos o formato incorrecto" }, { status: 400 });
    }

    const id = parseInt(serviceId);

    // Verificar si ya existe evidencia para evitar duplicados
    const existingService = await prisma.ordenServicio.findUnique({
      where: { id },
      select: { evidenciaPath: true }
    });

    if (existingService?.evidenciaPath) {
       return NextResponse.json({ message: "Este servicio ya tiene evidencia cargada." }, { status: 409 }); // 409 Conflict
    }

    // Guardar las URLs separadas por coma en la base de datos
    await prisma.ordenServicio.update({
      where: { id },
      data: {
        evidenciaPath: urls.join(',') 
      }
    });

    return NextResponse.json({ 
      message: "Evidencia guardada correctamente", 
      count: urls.length,
      urls: urls
    }, { status: 200 });

  } catch (error) {
    console.error("Error en upload-evidence:", error);
    return NextResponse.json({ message: "Error interno del servidor" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "pending";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

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

    if (!token) {
      return NextResponse.json(
        { message: "Token no proporcionado (Headers missing)" },
        { status: 401 },
      );
    }

    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: "Token inválido" }, { status: 401 });
    }

    const tecnicoId = decoded.userId;

    // Estados exactos considerados como "Finalizados"
    const completedNames = [
      "Finalizado",
      "Liquidado",
      "Completado",
      "Terminado",
    ];

    const whereClause = {
      tecnicoId: tecnicoId,
      estadoServicio: {
        nombre:
          type === "completed"
            ? { in: completedNames } // SOLO estos nombres
            : { notIn: completedNames }, // CUALQUIERA menos estos
      },
    };

    const services = await prisma.ordenServicio.findMany({
      where: whereClause,
      include: {
        cliente: {
          select: { nombre: true, apellido: true, telefono: true },
        },
        servicio: {
          select: { nombre: true },
        },
        estadoServicio: {
          select: { nombre: true },
        },
        tipoServicio: {
          select: { nombre: true },
        },
        direccion: {
          select: {
            direccion: true,
            barrio: true,
            piso: true,
            bloque: true,
            unidad: true,
            municipio: true,
            linkMaps: true,
          },
        },
      },
      orderBy: {
        fechaVisita: type === "completed" ? "desc" : "asc",
      },
      skip: skip,
      take: limit,
    });

    return NextResponse.json(
      {
        services,
        page,
        limit,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching services:", error);
    return NextResponse.json(
      { message: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

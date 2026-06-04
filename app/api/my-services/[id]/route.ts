import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const serviceId = parseInt(params.id);
    if (isNaN(serviceId)) {
      return NextResponse.json({ message: "ID inválido" }, { status: 400 });
    }

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
        { message: "Token no proporcionado" },
        { status: 401 },
      );
    }
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: "Token inválido" }, { status: 401 });
    }

    const service = await prisma.ordenServicio.findUnique({
      where: { id: serviceId },
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
            linkMaps: true
          },
        },
        geolocalizaciones: {
          orderBy: { createdAt: 'desc' },
        }
      },
    });

    if (!service) {
      return NextResponse.json({ message: "Servicio no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ service }, { status: 200 });
  } catch (error) {
    console.error("Error fetching service details:", error);
    return NextResponse.json(
      { message: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const ordenes = await prisma.ordenServicio.findMany({
      where: { tenantId: usuario.tenantId },
      orderBy: { id: "desc" },
      take: 100,
      include: {
        cliente: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            tipoDocumento: true,
            numeroDocumento: true,
            telefono: true,
            correo: true,
          },
        },
        empresa: { select: { id: true, nombre: true } },
        servicio: { select: { nombre: true } },
        tecnico: { select: { nombre: true, apellido: true } },
        tipoServicio: { select: { id: true, nombre: true } },
        creadoPor: { select: { nombre: true, apellido: true } },
        zona: { select: { nombre: true } },
      },
    });

    const ordenesSerialized = ordenes.map((orden) => ({
      ...orden,
      valorCotizado: orden.valorCotizado ? Number(orden.valorCotizado) : null,
      valorPagado: orden.valorPagado ? Number(orden.valorPagado) : null,
      valorRepuestos: orden.valorRepuestos ? Number(orden.valorRepuestos) : 0,
    }));

    return NextResponse.json({ ordenes: ordenesSerialized });
  } catch (error) {
    console.error("Error obteniendo órdenes vía API:", error);
    return NextResponse.json({ error: "Error al cargar las órdenes" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function PUT(request: Request) {
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

    const { pushToken } = await request.json();

    if (!pushToken) return NextResponse.json({ message: "Token requerido" }, { status: 400 });

    await prisma.usuario.update({
      where: { id: decoded.userId },
      data: { pushToken }
    });

    return NextResponse.json({ message: "Token guardado" }, { status: 200 });
  } catch {
    return NextResponse.json({ message: "Error interno" }, { status: 500 });
  }
}
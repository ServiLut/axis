import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/psychology";

export async function POST(req: NextRequest) {
  try {
    const { codigo } = await req.json();

    if (!codigo) {
      return NextResponse.json({ valid: false, error: "Código requerido" }, { status: 400 });
    }

    const usuario = await prisma.usuario.findFirst({
      where: { codigoReferido: codigo, tenantId: PSYCHOLOGY_TENANT_ID, activo: true, aprobado: true },
      select: { nombre: true, apellido: true }
    });

    if (usuario) {
      return NextResponse.json({ 
        valid: true, 
        usuario: { 
          nombre: usuario.nombre, 
          apellido: usuario.apellido 
        } 
      });
    } else {
      return NextResponse.json({ valid: false, error: "Código no válido" });
    }

  } catch (error) {
    console.error("Error validando código:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { nombre, apellido, telefono, codigoReferido } = await req.json();

    if (!nombre || !telefono || !codigoReferido) {
       return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
    }

    // Find referrer
    const referrer = await prisma.usuario.findFirst({
      where: { codigoReferido: codigoReferido }
    });

    if (!referrer) {
      return NextResponse.json({ error: "Código de referido inválido" }, { status: 400 });
    }

    const newReferido = await prisma.referidos.create({
      data: {
        nombre,
        apellido,
        telefono,
        referidoPorId: referrer.id,
      }
    });

    // Handle BigInt serialization
    const serializedReferido = {
        ...newReferido,
        id: newReferido.id.toString(),
    };

    return NextResponse.json({ success: true, referido: serializedReferido });

  } catch (error) {
    console.error("Error registrando referido:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

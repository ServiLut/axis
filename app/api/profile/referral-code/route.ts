import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

// Helper to generate code
function generateReferralCode(length: number = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function GET() {
  const headersList = await headers();
  let token = headersList.get("authorization");

  if (!token) {
    token = headersList.get("x-auth-token");
  } else {
    token = token.split(" ")[1];
  }

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
      select: { id: true, codigoReferido: true }
    });

    if (!usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (usuario.codigoReferido) {
      return NextResponse.json({ codigo: usuario.codigoReferido });
    }

    // Generate new code
    let newCode = generateReferralCode();
    let isUnique = false;
    let attempts = 0;

    // Retry loop to ensure uniqueness
    while (!isUnique && attempts < 10) {
      const existing = await prisma.usuario.findFirst({
        where: { codigoReferido: newCode }
      });
      if (!existing) {
        isUnique = true;
      } else {
        newCode = generateReferralCode();
        attempts++;
      }
    }

    if (!isUnique) {
      return NextResponse.json({ error: "Error generando código único" }, { status: 500 });
    }

    const updatedUser = await prisma.usuario.update({
      where: { id: payload.userId },
      data: { codigoReferido: newCode }
    });

    return NextResponse.json({ codigo: updatedUser.codigoReferido });

  } catch (error) {
    console.error("Error en referral-code:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

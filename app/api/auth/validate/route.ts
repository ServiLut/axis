import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return NextResponse.json({ valid: false, message: "No token provided" }, { status: 401 });
  }

  const payload = verifyToken(token);

  // Even if verifyToken returns payload (valid signature and claim), we must check DB
  // But if it returns null, it's definitely invalid
  if (!payload) {
    return NextResponse.json({ valid: false, message: "Invalid token signature or claim" }, { status: 401 });
  }

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { aprobado: true, activo: true }
    });

    if (!user) {
      return NextResponse.json({ valid: false, message: "User not found" }, { status: 401 });
    }

    if (!user.aprobado) {
       return NextResponse.json({ valid: false, message: "User not approved" }, { status: 403 });
    }
    
    if (!user.activo) {
        return NextResponse.json({ valid: false, message: "User inactive" }, { status: 403 });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Error validating session:", error);
    return NextResponse.json({ valid: false, message: "Server error" }, { status: 500 });
  }
}

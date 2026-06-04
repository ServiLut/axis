import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;
    let user = token ? verifyToken(token) : null;

    if (!user) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
        user = verifyToken(token);
      }
    }

    if (user) {
      // Cerrar sesiones abiertas
      const now = new Date();
      
      try {
        const result = await prisma.sesionActividad.updateMany({
          where: { 
            usuarioId: user.userId,
            fechaFin: null 
          },
          data: { 
            fechaFin: now 
          },
        });
        console.log(`[SIGN-OUT] Cerrando sesiones para usuario ${user.userId}. Registros actualizados: ${result.count}`);
      } catch (dbError) {
        console.error("Error actualizando DB al cerrar sesión:", dbError);
      }
    } else {
      console.warn("[SIGN-OUT] No se encontró un token válido en cookies o header");
    }

    // Borrar la cookie 'token'
    cookieStore.delete("token");

    return NextResponse.json(
      { message: "Sesión cerrada exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    return NextResponse.json(
      { message: "Error al cerrar sesión" },
      { status: 500 }
    );
  }
}
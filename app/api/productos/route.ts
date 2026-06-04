import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { serializeData } from "@/lib/utils";

export async function GET() {
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

    const tenantId = Number(decoded.tenantId);

    // Querying the "ProductosFumigacion" table as requested
    const products = await prisma.productosFumigacion.findMany({
      where: {
        tenantId: tenantId,
        // Removed activo: true to ensure all products are listed, even if activo is null
      },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        categoria: true,
        unidadMedida: true,
        precio: true,
        Moneda: true,
      },
      orderBy: {
        nombre: "asc",
      },
    });

    console.log(`Found ${products.length} products for tenant ${tenantId}`);

    return NextResponse.json(
      {
        products: serializeData(products),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { message: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

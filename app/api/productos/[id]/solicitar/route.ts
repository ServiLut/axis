import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { serializeData } from "@/lib/utils";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { cantidad, unidadMedida } = await request.json();

    if (!cantidad || !unidadMedida) {
      return NextResponse.json(
        { message: "Cantidad y unidad de medida son requeridos" },
        { status: 400 }
      );
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

    const solicitud = await prisma.productosFumigacionSolicitados.create({
      data: {
        tenantId: decoded.tenantId,
        userId: decoded.userId,
        productoId: BigInt(id),
        cantidad: String(cantidad),
        unidadMedida: String(unidadMedida),
        estado: "PENDIENTE",
      },
      include: {
        Usuario: {
          select: {
            nombre: true,
            apellido: true,
          },
        },
        ProductosFumigacion: {
          select: {
            nombre: true,
          },
        },
      },
    });

    const channel = supabase.channel("dashboard-notifications");
    await channel.send({
      type: "broadcast",
      event: "product-requested",
      payload: {
        requestId: solicitud.id.toString(),
        technicianName: `${solicitud.Usuario?.nombre || ""} ${solicitud.Usuario?.apellido || ""}`.trim(),
        productName: solicitud.ProductosFumigacion?.nombre || "Producto desconocido",
        amount: solicitud.cantidad,
        unit: solicitud.unidadMedida,
      },
    });
    supabase.removeChannel(channel);

    return NextResponse.json({ 
      message: "Solicitud creada exitosamente",
      solicitud: serializeData(solicitud)
    }, { status: 201 });

  } catch (error) {
    console.error("Error creating product request:", error);
    return NextResponse.json(
      { message: "Error interno del servidor" },
      { status: 500 },
    );
  }
}

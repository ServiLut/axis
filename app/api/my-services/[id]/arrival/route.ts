import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";

// Configura tu cliente Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> },
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

    if (!token)
      return NextResponse.json({ message: "No autorizado" }, { status: 401 });
    const decoded = verifyToken(token);
    if (!decoded)
      return NextResponse.json({ message: "Token inválido" }, { status: 401 });

    // Cambiamos a FormData para recibir archivo + datos
    const formData = await request.formData();
    const latitud = formData.get("latitud");
    const longitud = formData.get("longitud");
    const linkMaps = formData.get("linkMaps") as string;
    const file = formData.get("foto") as File;

    if (!latitud || !longitud) {
      return NextResponse.json(
        { message: "Coordenadas requeridas" },
        { status: 400 },
      );
    }

    if (!file) {
      return NextResponse.json(
        { message: "La foto de evidencia es requerida" },
        { status: 400 },
      );
    }

    // --- SUBIDA A SUPABASE ---
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const filename = `llegada_${serviceId}_${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("fotoLlegada") // Bucket específico
      .upload(filename, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      return NextResponse.json(
        { message: "Error al subir la imagen" },
        { status: 500 },
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("fotoLlegada")
      .getPublicUrl(filename);

    const fotoUrl = publicUrlData.publicUrl;

    // Crear registro de geolocalización
    await prisma.geolocalizacion.create({
      data: {
        tenantId: decoded.tenantId || 1,
        usuarioId: decoded.userId,
        ordenId: serviceId,
        latitud: Number(latitud), // Asegurar conversión a número/decimal
        longitud: Number(longitud),
        llegada: new Date(),
        linkMaps: linkMaps,
        fotoLlegada: fotoUrl, // Guardamos la URL
      },
    });

    // Actualizar estado a "En Proceso"
    const estadoEnProceso = await prisma.estadoServicio.findFirst({
      where: { nombre: { contains: "Proceso", mode: "insensitive" } },
    });

    if (estadoEnProceso) {
      await prisma.ordenServicio.update({
        where: { id: serviceId },
        data: { estadoServicioId: estadoEnProceso.id },
      });
    }

    // --- BROADCAST NOTIFICATION ---
    const serviceDetails = await prisma.ordenServicio.findUnique({
      where: { id: serviceId },
      include: {
        cliente: { select: { nombre: true, apellido: true, telefono: true } },
        tecnico: { select: { nombre: true, apellido: true } },
      },
    });

    if (serviceDetails) {
      const channel = supabase.channel("dashboard-notifications");
      await channel.send({
        type: "broadcast",
        event: "service-arrival",
        payload: {
          serviceId: serviceId,
          technicianName: `${serviceDetails.tecnico?.nombre || ""} ${serviceDetails.tecnico?.apellido || ""}`.trim(),
          clientName: `${serviceDetails.cliente?.nombre || ""} ${serviceDetails.cliente?.apellido || ""}`.trim(),
          clientPhone: serviceDetails.cliente?.telefono,
        },
      });
      // Cleanup channel reference if needed, but for serverless function it's ephemeral
      supabase.removeChannel(channel);
    }

    return NextResponse.json(
      { message: "Llegada registrada exitosamente" },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error registering arrival:", error);
    return NextResponse.json({ message: "Error interno" }, { status: 500 });
  }
}

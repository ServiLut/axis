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

export async function PUT(
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

    // Leer FormData
    const formData = await request.formData();
    const nivelInfestacion = formData.get("nivelInfestacion") as string;
    const condicionesHigiene = formData.get("condicionesHigiene") as string;
    const condicionesLocal = formData.get("condicionesLocal") as string;
    const valorPagadoStr = formData.get("valorPagado") as string;
    const valorPagado = valorPagadoStr ? parseFloat(valorPagadoStr) : null;
    
    // Nuevo campo para saber si pidió factura electrónica
    const requiereFacturaElectronica = formData.get("requiereFacturaElectronica") === 'true';
    
    // Leemos el método de pago que seleccionó el usuario en el modal ('efectivo' | 'transferencia')
    const metodoPagoSeleccionado = formData.get("metodoPagoSeleccionado") as string;

    // Archivos
    const facturaFile = formData.get("factura") as File;
    const fotoSalidaFile = formData.get("fotoSalida") as File;
    const comprobantePagoFile = formData.get("comprobantePago") as File;

    const service = await prisma.ordenServicio.findUnique({
      where: { id: serviceId },
    });
    
    // Validaciones de archivos basadas en la SELECCIÓN ACTUAL del usuario
    // Si no viene selección (versión vieja app), fallback a lo que diga la BD.
    const esEfectivo = metodoPagoSeleccionado === 'efectivo' || (!metodoPagoSeleccionado && service?.metodoPagoId === 1);
    
    // 1. Factura física obligatoria si es Efectivo
    if (esEfectivo && !facturaFile) {
      return NextResponse.json(
        {
          message: "La foto de la factura es obligatoria para pagos en efectivo",
        },
        { status: 400 },
      );
    }
    
    // 2. Si NO es efectivo (ej. Transferencia) y NO pidió factura electrónica,
    //    entonces debe haber subido la factura física.
    if (!esEfectivo && !requiereFacturaElectronica && !facturaFile) {
       return NextResponse.json(
        {
          message: "Debe adjuntar la foto de la factura física si no solicitó electrónica",
        },
        { status: 400 },
      );
    }

    if (!fotoSalidaFile) {
      return NextResponse.json(
        { message: "La foto de salida es obligatoria" },
        { status: 400 },
      );
    }

    // --- SUBIDA FACTURA (Bucket 'facturas') ---
    let facturaUrl: string | null = null;
    if (facturaFile) {
      const facturaBytes = await facturaFile.arrayBuffer();
      const facturaBuffer = Buffer.from(facturaBytes);
      const facturaName = `factura_${serviceId}_${Date.now()}.jpg`;

      const { error: uploadFacturaError } = await supabase.storage
        .from("facturas")
        .upload(facturaName, facturaBuffer, {
          contentType: facturaFile.type || "image/jpeg",
        });

      if (uploadFacturaError) {
        console.error("Supabase Upload Error (Factura):", uploadFacturaError);
        return NextResponse.json(
          { message: "Error al subir la factura" },
          { status: 500 },
        );
      }

      const { data: facturaUrlData } = supabase.storage
        .from("facturas")
        .getPublicUrl(facturaName);
      facturaUrl = facturaUrlData.publicUrl;
    }

    // --- SUBIDA COMPROBANTE PAGO (Bucket 'comprobantePago') ---
    let comprobantePagoUrl: string | null = null;
    if (comprobantePagoFile && comprobantePagoFile.size > 0) {
      const comprobanteBytes = await comprobantePagoFile.arrayBuffer();
      const comprobanteBuffer = Buffer.from(comprobanteBytes);
      const comprobanteName = `comprobante_${serviceId}_${Date.now()}.jpg`;

      const { error: uploadComprobanteError } = await supabase.storage
        .from("comprobantePago")
        .upload(comprobanteName, comprobanteBuffer, {
          contentType: comprobantePagoFile.type || "image/jpeg",
        });

      if (uploadComprobanteError) {
        console.error("Supabase Upload Error (Comprobante):", uploadComprobanteError);
        return NextResponse.json(
          { message: "Error al subir el comprobante de pago" },
          { status: 500 },
        );
      }

      const { data: comprobanteUrlData } = supabase.storage
        .from("comprobantePago")
        .getPublicUrl(comprobanteName);
      comprobantePagoUrl = comprobanteUrlData.publicUrl;
    }

    // --- SUBIDA FOTO SALIDA (Bucket 'fotoSalida') ---
    const salidaBytes = await fotoSalidaFile.arrayBuffer();
    const salidaBuffer = Buffer.from(salidaBytes);
    const salidaName = `salida_${serviceId}_${Date.now()}.jpg`;

    const { error: uploadSalidaError } = await supabase.storage
      .from("fotoSalida")
      .upload(salidaName, salidaBuffer, {
        contentType: fotoSalidaFile.type || "image/jpeg",
      });

    if (uploadSalidaError) {
      console.error("Supabase Upload Error (Salida):", uploadSalidaError);
      return NextResponse.json(
        { message: "Error al subir foto de salida" },
        { status: 500 },
      );
    }

    const { data: salidaUrlData } = supabase.storage
      .from("fotoSalida")
      .getPublicUrl(salidaName);
    const fotoSalidaUrl = salidaUrlData.publicUrl;

    // 1. Actualizar OrdenServicio (Factura + HoraFin + MetodoPago si cambió)
    // Determinamos el ID del método de pago si se envió selección
    // Asumimos 1=Efectivo, y otro ID para Transferencia (ej. 2 o lo que corresponda en tu BD)
    // Si no sabes el ID exacto de transferencia, mantenemos el actual si no es efectivo, 
    // o deberías buscarlo. Por ahora, si es efectivo forzamos 1.
    
    let nuevoMetodoPagoId = service?.metodoPagoId;
    if (metodoPagoSeleccionado === 'efectivo') {
        nuevoMetodoPagoId = 1;
    } else if (metodoPagoSeleccionado === 'transferencia') {
        // Idealmente buscar el ID de transferencia en la BD o usar una constante conocida.
        // Si el actual era efectivo (1), cambiamos a un valor por defecto para transferencia o NULL si no lo tenemos.
        // Para evitar errores de FK, asumiremos que si seleccionó transferencia y ya tenía un ID válido distinto de 1, lo dejamos.
        // Si era 1, necesitamos cambiarlo. Voy a buscar el ID de "Transferencia" si es necesario.
        if (service?.metodoPagoId === 1) {
             const metodoTransferencia = await prisma.metodoPago.findFirst({
                 where: { nombre: { contains: 'Transferencia' } }
             });
             if (metodoTransferencia) nuevoMetodoPagoId = metodoTransferencia.id;
        }
    }

    const updatedOrder = await prisma.ordenServicio.update({
      where: { id: serviceId },
      data: {
        nivelInfestacion,
        condicionesHigiene,
        condicionesLocal,
        estadoServicioId: 64,
        horaFin: new Date(),
        facturaPath: facturaUrl,
        comprobantePago: comprobantePagoUrl,
        valorPagado,
        metodoPagoId: nuevoMetodoPagoId // Actualizamos el método de pago
      },
    });

    // 2. Actualizar Geolocalizacion (Salida + FotoSalida)
    const lastGeo = await prisma.geolocalizacion.findFirst({
      where: { ordenId: serviceId, salida: null },
      orderBy: { createdAt: "desc" },
    });

    if (lastGeo) {
      await prisma.geolocalizacion.update({
        where: { id: lastGeo.id },
        data: {
          salida: new Date(),
          fotoSalida: fotoSalidaUrl,
        },
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
        event: "service-finalized",
        payload: {
          serviceId: serviceId,
          technicianName: `${serviceDetails.tecnico?.nombre || ""} ${serviceDetails.tecnico?.apellido || ""}`.trim(),
          clientName: `${serviceDetails.cliente?.nombre || ""} ${serviceDetails.cliente?.apellido || ""}`.trim(),
          clientPhone: serviceDetails.cliente?.telefono,
        },
      });
      supabase.removeChannel(channel);
    }

    return NextResponse.json(
      { message: "Servicio finalizado", order: updatedOrder },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error finalizing service:", error);
    return NextResponse.json({ message: "Error interno" }, { status: 500 });
  }
}

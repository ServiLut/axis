"use server";

import prisma from "@/lib/prisma";

import { verifyToken } from "@/lib/auth";

import { revalidatePath } from "next/cache";

import { EstadoSolicitudProductos } from "@/prisma/generated/prisma/client";

import { serializeData } from "@/lib/utils";

import { sendPushNotification } from "@/lib/notifications";



export async function getProducts(token: string) {

  const payload = verifyToken(token);

  if (!payload) throw new Error("Unauthorized");



  const products = await prisma.productosFumigacion.findMany({

    where: {

      tenantId: payload.tenantId,

    },

    include: {

      Proveedores: true,

    },

    orderBy: {

      nombre: "asc",

    },

  });



  return serializeData(products);

}



export async function getProductRequests(token: string) {

  const payload = verifyToken(token);

  if (!payload) throw new Error("Unauthorized");



  const requests = await prisma.productosFumigacionSolicitados.findMany({

    where: {

      tenantId: payload.tenantId,

    },

    include: {

      ProductosFumigacion: true,

      Usuario: {

        select: {

          nombre: true,

          apellido: true,

        },

      },

    },

    orderBy: {

      created_at: "desc",

    },

  });



  return serializeData(requests);

}



export async function updateProductRequestStatus(

  token: string,

  requestId: number | string,

  status: EstadoSolicitudProductos

) {

  const payload = verifyToken(token);

  if (!payload) throw new Error("Unauthorized");



  const id = typeof requestId === "string" ? BigInt(requestId) : BigInt(requestId);



  const request = await prisma.productosFumigacionSolicitados.findUnique({

    where: { id },

    include: { ProductosFumigacion: true },

  });



  if (!request) throw new Error("Request not found");



  // If accepting, we could potentially decrease stock

  if (status === "ACEPTADA" && request.productoId && request.cantidad) {

    const qty = parseFloat(request.cantidad);

    if (!isNaN(qty)) {

      await prisma.productosFumigacion.update({

        where: { id: request.productoId },

        data: {

          stockActual: {

            decrement: BigInt(Math.floor(qty)),

          },

        },

      });

    }

  }



  await prisma.productosFumigacionSolicitados.update({

    where: { id },

    data: { estado: status },

  });



  // Notify technician

  if (request.userId) {

    const title = status === "ACEPTADA" ? "Solicitud Aprobada" : "Solicitud Rechazada";

    const body = `Tu solicitud de ${request.ProductosFumigacion?.nombre || "producto"} ha sido ${status.toLowerCase()}.`;

    await sendPushNotification(request.userId, title, body, { requestId: id.toString() });

  }



  revalidatePath("/dashboard/insumos/solicitudes");

  revalidatePath("/dashboard/insumos/stock");

  return { success: true };

}

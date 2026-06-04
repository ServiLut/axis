"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { Expo } from "expo-server-sdk";

export async function sendUpdateNotification(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  // Only Admin/SuAdmin can send
  if (payload.role !== "ADMIN" && payload.role !== "SU_ADMIN") {
    return { error: "Permisos insuficientes" };
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    // Fetch all technicians with push tokens in this tenant
    const technicians = await prisma.usuario.findMany({
      where: {
        tenantId: usuario.tenantId,
        rol: "TECNICO",
        pushToken: { not: null },
        activo: true,
      },
      select: {
        pushToken: true,
      },
    });

    const messages = [];

    // Filter valid tokens
    const validTokens = technicians
      .map((t) => t.pushToken)
      .filter((token) => token && Expo.isExpoPushToken(token)) as string[];

    if (validTokens.length === 0) {
      return {
        success: true,
        count: 0,
        message: "No hay técnicos con tokens válidos",
      };
    }

    // Construct messages
    // Sending specific data 'update_available' so the app can react
    for (const pushToken of validTokens) {
      messages.push({
        to: pushToken,
        sound: "default",
        title: "📢 Nueva Actualización Disponible",
        body: "Hemos realizado mejoras. Por favor descarga la app para actualizar.",
        data: { type: "update_available" },
      });
    }

    // Send in chunks
    const expo = new Expo();
    const chunks = expo.chunkPushNotifications(messages);
    let successCount = 0;

    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
        successCount += chunk.length;
      } catch (error) {
        console.error("Error sending chunk:", error);
      }
    }

    return {
      success: true,
      count: successCount,
      message: `Notificación de actualización enviada a ${successCount} técnicos`,
    };
  } catch (error) {
    console.error("Error sending update notification:", error);
    return { error: "Error al enviar notificaciones" };
  }
}

import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import prisma from './prisma';

const expo = new Expo();

export async function sendPushNotification(tecnicoId: number, title: string, body: string, data?: Record<string, unknown>) {
  try {
    const tecnico = await prisma.usuario.findUnique({
      where: { id: tecnicoId },
      select: { pushToken: true }
    });

    if (!tecnico?.pushToken || !Expo.isExpoPushToken(tecnico.pushToken)) {
      return;
    }

    const messages: ExpoPushMessage[] = [
      {
        to: tecnico.pushToken,
        sound: 'default',
        title,
        body,
        data,
      }
    ];

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        console.error("Error sending push notification chunk:", error);
      }
    }
  } catch (error) {
    console.error("Error in sendPushNotification:", error);
  }
}

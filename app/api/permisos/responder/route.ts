import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Token no proporcionado', { status: 400 });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { permisoId: number; action: string };
    const { permisoId, action } = payload;

    if (!['APROBADO', 'RECHAZADO'].includes(action)) {
       return new NextResponse('Acción inválida', { status: 400 });
    }

    // Verify permission exists and is pending
    const existingPermiso = await prisma.permiso.findUnique({
        where: { id: permisoId }
    });

    if (!existingPermiso) {
        return new NextResponse('Solicitud no encontrada', { status: 404 });
    }

    if (existingPermiso.estado !== 'PENDIENTE') {
         return new NextResponse(`
            <html>
              <body style="font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f3f4f6;">
                <div style="text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
                  <h1 style="color: #4b5563">Solicitud ya procesada</h1>
                  <p>Esta solicitud ya se encuentra en estado: <strong>${existingPermiso.estado}</strong></p>
                </div>
              </body>
            </html>
          `, { headers: { 'Content-Type': 'text/html' } });
    }

    // Update DB
    const updateData: {
        estado: 'APROBADO' | 'RECHAZADO';
        fechaAprobacion: Date;
        fechaExpiracion?: Date;
    } = {
        estado: action as 'APROBADO' | 'RECHAZADO',
        fechaAprobacion: new Date(),
    };

    if (action === 'APROBADO') {
        const fechaExpiracion = new Date();
        fechaExpiracion.setMinutes(fechaExpiracion.getMinutes() + 60); // Default 60 mins
        updateData.fechaExpiracion = fechaExpiracion;
    }

    await prisma.permiso.update({
        where: { id: permisoId },
        data: updateData
    });

    return new NextResponse(`
      <html>
        <body style="font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f0fdf4;">
          <div style="text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            <h1 style="color: ${action === 'APROBADO' ? '#16a34a' : '#dc2626'}">Solicitud ${action}</h1>
            <p>La solicitud de permiso ha sido procesada correctamente.</p>
            <p>Puedes cerrar esta ventana.</p>
          </div>
        </body>
      </html>
    `, {
        headers: { 'Content-Type': 'text/html' }
    });

  } catch {
    return new NextResponse('Token inválido o expirado', { status: 400 });
  }
}

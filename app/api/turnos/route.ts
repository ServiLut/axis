import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function POST(request: Request) {
    try {
        const headersList = await headers();
        const authorization = headersList.get("authorization");
        if (!authorization) return NextResponse.json({ message: "No autorizado" }, { status: 401 });

        const token = authorization.split(" ")[1];
        const payload = verifyToken(token);
        
        if (!payload) return NextResponse.json({ message: "Token inválido" }, { status: 401 });

        // Get User
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId },
            select: { tenantId: true },
        });

        if (!usuario) return NextResponse.json({ message: "Usuario no encontrado" }, { status: 404 });

        const formData = await request.formData();
        
        const fechaStr = formData.get("fecha") as string;
        const horaEntradaStr = formData.get("horaEntrada") as string;
        const horaSalidaStr = formData.get("horaSalida") as string;
        const tiempoDescansoStr = formData.get("tiempoDescanso") as string;
        const observaciones = formData.get("observaciones") as string;
        
        // Now expecting URLs directly
        const fotoEntradaUrl = formData.get("fotoEntradaUrl") as string | null;
        const fotoSalidaUrl = formData.get("fotoSalidaUrl") as string | null;

        if (!fechaStr || !horaEntradaStr || !horaSalidaStr) {
            return NextResponse.json({ message: "Campos obligatorios faltantes" }, { status: 400 });
        }

        // Parse Dates
        const [year, month, day] = fechaStr.split('-').map(Number);
        const [hEntrada, mEntrada] = horaEntradaStr.split(':').map(Number);
        const [hSalida, mSalida] = horaSalidaStr.split(':').map(Number);

        const fecha = new Date(Date.UTC(year, month - 1, day));
        const horaEntrada = new Date(Date.UTC(year, month - 1, day, hEntrada, mEntrada));
        const horaSalida = new Date(Date.UTC(year, month - 1, day, hSalida, mSalida));
        
        if (horaSalida < horaEntrada) {
            horaSalida.setDate(horaSalida.getDate() + 1);
        }

        const tiempoDescanso = parseInt(tiempoDescansoStr) || 0;

        // Calculate Totals
        const userWithCuenta = await prisma.usuario.findUnique({
            where: { id: payload.userId },
            include: { CuentasPago: true }
        });

        const diffMs = horaSalida.getTime() - horaEntrada.getTime();
        let hoursWorked = diffMs / (1000 * 60 * 60); 
        const breakHours = tiempoDescanso / 60; 
        hoursWorked -= breakHours;

        if (hoursWorked < 0) hoursWorked = 0;
        hoursWorked = Math.round(hoursWorked * 100) / 100;

        const valorHora = userWithCuenta?.CuentasPago?.[0]?.valorHora || 0;
        const valorTotal = hoursWorked * valorHora;

        const nuevoTurno = await prisma.turno.create({
            data: {
                tenantId: usuario.tenantId,
                usuarioId: payload.userId,
                fecha,
                horaEntrada,
                horaSalida,
                tiempoDescanso,
                observaciones,
                valorTotal,
                fotoEntrada: fotoEntradaUrl || null,
                fotoSalida: fotoSalidaUrl || null
            }
        });

        return NextResponse.json({ 
            success: true, 
            message: "Turno registrado exitosamente",
            turno: nuevoTurno
        }, { status: 201 });

    } catch (error) {
        console.error("Error creating turno:", error);
        return NextResponse.json({ message: "Error interno del servidor" }, { status: 500 });
    }
}
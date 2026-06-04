import { NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const turnoId = parseInt(id);
        
        const headersList = await headers();
        const authorization = headersList.get("authorization");
        if (!authorization) return NextResponse.json({ message: "No autorizado" }, { status: 401 });

        const token = authorization.split(" ")[1];
        const payload = verifyToken(token);
        
        if (!payload) return NextResponse.json({ message: "Token inválido" }, { status: 401 });

        // Get User & Check ownership
        const existingTurno = await prisma.turno.findUnique({
            where: { id: turnoId },
        });

        if (!existingTurno) return NextResponse.json({ message: "Turno no encontrado" }, { status: 404 });
        if (existingTurno.usuarioId !== payload.userId) return NextResponse.json({ message: "No autorizado" }, { status: 403 });
        if (existingTurno.cuentaCobroId) return NextResponse.json({ message: "No se puede editar un turno cerrado" }, { status: 400 });

        const formData = await request.formData();
        
        const fechaStr = formData.get("fecha") as string;
        const horaEntradaStr = formData.get("horaEntrada") as string;
        const horaSalidaStr = formData.get("horaSalida") as string;
        const tiempoDescansoStr = formData.get("tiempoDescanso") as string;
        const observaciones = formData.get("observaciones") as string;
        
        // Expecting URLs or empty strings/null if no change/deletion (logic depends on how client sends it)
        // If client sends a new URL, we update. If client sends nothing, we assume no change?
        // Let's assume client sends the URL if it changed or if it is new.
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

        // Update URLs only if provided. 
        // Note: Client logic should be: if new file uploaded -> send new URL. 
        // If no new file -> don't send anything or send the old URL? 
        // Let's assume if it's in formData, it's the intended value.
        // But if it's null/undefined in formData, do we keep existing?
        // Let's check how we handle partial updates usually.
        // With FormData, missing keys usually mean "not provided".
        // But here we are explicit.
        
        interface UpdateData {
            fecha: Date;
            horaEntrada: Date;
            horaSalida: Date;
            tiempoDescanso: number;
            observaciones: string;
            valorTotal: number;
            fotoEntrada?: string;
            fotoSalida?: string;
        }

        const updateData: UpdateData = {
            fecha,
            horaEntrada,
            horaSalida,
            tiempoDescanso,
            observaciones,
            valorTotal,
        };

        if (fotoEntradaUrl !== null) {
            updateData.fotoEntrada = fotoEntradaUrl;
        }

        if (fotoSalidaUrl !== null) {
            updateData.fotoSalida = fotoSalidaUrl;
        }

        const updatedTurno = await prisma.turno.update({
            where: { id: turnoId },
            data: updateData
        });

        return NextResponse.json({ 
            success: true, 
            message: "Turno actualizado exitosamente",
            turno: updatedTurno
        }, { status: 200 });

    } catch (error) {
        console.error("Error updating turno:", error);
        return NextResponse.json({ message: "Error interno del servidor" }, { status: 500 });
    }
}
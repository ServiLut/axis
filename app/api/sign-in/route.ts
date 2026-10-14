import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";
import { signToken } from "@/lib/auth";
import { isPsychologyTenant, PSYCHOLOGY_NAME } from "@/lib/psychology";
import {isLuisaServiceUser} from '@/lib/psychology-bot-operator';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { message: "Usuario y contraseña son requeridos" },
        { status: 400 }
      );
    }

    // Buscar usuario por username
    const user = await prisma.usuario.findUnique({
      where: { username },
      include: { tenant: true },
    });

    // Si no existe o no está activo (opcional: no revelar cuál falló)
    if (!user || isLuisaServiceUser(user.username)) {
      return NextResponse.json(
        { message: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    if (!user.activo) {
      return NextResponse.json(
        { message: "Cuenta inactiva. Contacte al administrador." },
        { status: 403 }
      );
    }

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return NextResponse.json(
        { message: "Credenciales inválidas" },
        { status: 401 }
      );
    }

    if (!user.rol) {
      return NextResponse.json(
        { message: "El usuario no tiene un rol asignado." },
        { status: 403 }
      );
    }

    if (!isPsychologyTenant(user.tenantId)) {
      return NextResponse.json({ message: "Axis está disponible exclusivamente para el equipo de Psicólogos en Colombia. Contacta a la administración para revisar tu acceso." }, { status: 403 });
    }

    // Generar token
    const token = signToken({
      userId: user.id,
      tenantId: user.tenantId,
      tenantName: PSYCHOLOGY_NAME,
      username: user.username,
      nombre: user.nombre,
      apellido: user.apellido,
      role: user.rol,
      aprobado: user.aprobado ?? false,
      authVersion: user.authVersion,
    });

    // Crear objeto de usuario sin password para la respuesta
    const userWithoutPassword = {
      id: user.id,
      tenantId: user.tenantId,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      telefono: user.telefono,
      rol: user.rol,
      activo: user.activo,
      aprobado: user.aprobado,
    };

    return NextResponse.json(
      {
        message: "Inicio de sesión exitoso",
        token,
        user: userWithoutPassword,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en login:", error);
    return NextResponse.json(
      { message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

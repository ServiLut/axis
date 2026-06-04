import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcrypt";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      username,
      email,
      password,
      nombre,
      apellido,
      tipoDocumento,
      numeroDocumento,
      telefono,
    } = body;

    // 1. Validaciones básicas
    if (!username || !email || !password || !nombre || !apellido) {
      return NextResponse.json(
        { message: "Faltan campos obligatorios" },
        { status: 400 },
      );
    }

    // 2. Verificar duplicados (username, email, documento)
    const existingUser = await prisma.usuario.findFirst({
      where: {
        OR: [
          { username: username },
          { email: email },
          { numeroDocumento: numeroDocumento },
        ],
      },
    });

    if (existingUser) {
      let field = "";
      if (existingUser.username === username) field = "Nombre de usuario";
      else if (existingUser.email === email) field = "Correo electrónico";
      else if (existingUser.numeroDocumento === numeroDocumento)
        field = "Número de documento";

      return NextResponse.json(
        { message: `${field} ya se encuentra registrado.` },
        { status: 409 },
      );
    }

    // 3. Hash del password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Crear usuario con tenantId por defecto (1)
    const newUser = await prisma.usuario.create({
      data: {
        username,
        email,
        password: hashedPassword,
        nombre,
        apellido,
        tipoDocumento,
        numeroDocumento,
        telefono,
        activo: true,
        aprobado: false, // Explicitly set as pending
        tenantId: 1, // Asignar al tenant por defecto
      },
    });

    // Crear objeto de usuario sin password para la respuesta
    const userWithoutPassword = {
      id: newUser.id,
      tenantId: newUser.tenantId,
      username: newUser.username,
      email: newUser.email,
      nombre: newUser.nombre,
      apellido: newUser.apellido,
      tipoDocumento: newUser.tipoDocumento,
      numeroDocumento: newUser.numeroDocumento,
      telefono: newUser.telefono,
      rol: newUser.rol,
      activo: newUser.activo,
      aprobado: newUser.aprobado,
    };

    return NextResponse.json(
      {
        message: "Usuario registrado exitosamente",
        user: userWithoutPassword,
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Error en el registro:", error);
    return NextResponse.json(
      { message: "Error interno del servidor", details: error as unknown },
      { status: 500 },
    );
  }
}

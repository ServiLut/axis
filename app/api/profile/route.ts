import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import bcrypt from "bcrypt";
import { Prisma } from "@/prisma/generated/prisma/client";

export async function GET() {
  const headersList = await headers();
  let token = headersList.get("authorization");

  if (!token) {
    token = headersList.get("x-auth-token");
  } else {
    token = token.split(" ")[1];
  }

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        username: true,
        email: true,
        nombre: true,
        apellido: true,
        telefono: true,
        tipoDocumento: true,
        numeroDocumento: true,
        rol: true,
        tenantId: true,
        aprobado: true,
        activo: true,
        CuentasPago: {
          select: {
            id: true,
            banco: true,
            tipoCuenta: true,
            numeroCuenta: true,
            valorHora: true,
          }
        }
      },
    });

    if (!usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (!usuario.aprobado || !usuario.activo) {
      return NextResponse.json({ error: "Cuenta inactiva o no aprobada" }, { status: 403 });
    }

    // Convert BigInt to string for CuentasPago
    const usuarioWithSerializedCuentas = {
      ...usuario,
      CuentasPago: usuario.CuentasPago.map(cuenta => ({
        ...cuenta,
        id: cuenta.id.toString()
      }))
    };

    return NextResponse.json({ usuario: usuarioWithSerializedCuentas });
  } catch (error) {
    console.error("Error obteniendo perfil:", error);
    return NextResponse.json({ error: "Error al cargar el perfil" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const headersList = await headers();
  let token = headersList.get("authorization");

  if (!token) {
    token = headersList.get("x-auth-token");
  } else {
    token = token.split(" ")[1];
  }

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const payload = verifyToken(token);

  if (!payload) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  try {
    const formData = await req.json();
    const { 
      username, 
      email, 
      nombre, 
      apellido, 
      telefono, 
      tipoDocumento, 
      numeroDocumento, 
      password,
      cuentaPago 
    } = formData;

    if (!username || !email || !nombre || !apellido) {
        return NextResponse.json({ error: "Campos obligatorios faltantes" }, { status: 400 });
    }

    const dataToUpdate: Prisma.UsuarioUpdateInput = {
        username,
        email,
        nombre,
        apellido,
        telefono,
        tipoDocumento,
        numeroDocumento,
    };
    
    if (password && password.trim() !== "") {
        const hashedPassword = await bcrypt.hash(password, 10);
        dataToUpdate.password = hashedPassword;
    }

    // Update user info
    await prisma.usuario.update({
        where: { id: payload.userId },
        data: dataToUpdate
    });

    // Handle CuentaPago update/create if provided
    if (cuentaPago) {
      const user = await prisma.usuario.findUnique({
        where: { id: payload.userId },
        include: { CuentasPago: true }
      });

      if (user) {
        const valorHora = cuentaPago.valorHora ? parseFloat(cuentaPago.valorHora) : null;

        if (user.CuentasPago && user.CuentasPago.length > 0) {
          // Update existing (first one)
          await prisma.cuentasPago.update({
            where: { id: user.CuentasPago[0].id },
            data: {
              banco: cuentaPago.banco,
              tipoCuenta: cuentaPago.tipoCuenta,
              numeroCuenta: cuentaPago.numeroCuenta,
              valorHora: valorHora,
            }
          });
        } else {
          // Create new
          await prisma.cuentasPago.create({
            data: {
              userId: user.id,
              tenantId: user.tenantId,
              banco: cuentaPago.banco,
              tipoCuenta: cuentaPago.tipoCuenta,
              numeroCuenta: cuentaPago.numeroCuenta,
              valorHora: valorHora,
              createdAt: new Date(),
            }
          });
        }
      }
    }

    return NextResponse.json({ success: true, message: "Perfil actualizado exitosamente" });
  } catch (error) {
    console.error("Error actualizando perfil:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = error.meta?.target as string[] | undefined;
        if (target && target.includes('email')) {
             return NextResponse.json({ error: "El correo electrónico ya está en uso." }, { status: 409 });
        }
        if (target && target.includes('username')) {
             return NextResponse.json({ error: "El nombre de usuario ya está en uso." }, { status: 409 });
        }
        return NextResponse.json({ error: "El usuario, correo o documento ya existe." }, { status: 409 });
    }
    return NextResponse.json({ error: "Error al actualizar el perfil" }, { status: 500 });
  }
}

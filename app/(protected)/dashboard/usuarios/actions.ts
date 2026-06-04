"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcrypt";
import { Rol } from "@/prisma/generated/prisma/client";
import { createAuditLog } from "@/lib/audit";

export async function createUsuario(token: string, formData: FormData) {
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado" };
  }

  try {
    const usuarioAdmin = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuarioAdmin) {
      return { error: "Usuario no encontrado" };
    }

    const username = formData.get("username") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const nombre = formData.get("nombre") as string;
    const apellido = formData.get("apellido") as string;
    const telefono = formData.get("telefono") as string;
    const tipoDocumento = formData.get("tipoDocumento") as string;
    const numeroDocumento = formData.get("numeroDocumento") as string;
    const rol = formData.get("rol") as Rol;
    const empresaId = formData.get("empresaId") ? parseInt(formData.get("empresaId") as string) : null;
    const activo = formData.get("activo") === "on";

    // Validaciones básicas
    if (!username || !email || !password || !nombre || !apellido || !rol) {
      return { error: "Faltan campos obligatorios" };
    }

    if (password.length < 6) {
      return { error: "La contraseña debe tener al menos 6 caracteres" };
    }

    // Validar duplicados
    const existingUser = await prisma.usuario.findFirst({
      where: {
        OR: [
          { username },
          { email },
          { numeroDocumento: numeroDocumento || undefined } // Solo busca si hay numeroDocumento
        ],
        tenantId: usuarioAdmin.tenantId
      }
    });

    if (existingUser) {
      if (existingUser.username === username) return { error: "El nombre de usuario ya existe" };
      if (existingUser.email === email) return { error: "El correo electrónico ya existe" };
      if (numeroDocumento && existingUser.numeroDocumento === numeroDocumento) return { error: "El número de documento ya existe" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const nuevoUsuario = await prisma.usuario.create({
      data: {
        tenantId: usuarioAdmin.tenantId,
        username,
        email,
        password: hashedPassword,
        nombre,
        apellido,
        telefono,
        tipoDocumento: tipoDocumento || null,
        numeroDocumento: numeroDocumento || null,
        rol,
        empresaId,
        activo,
        aprobado: true, // Set aprobado to true by default for dashboard-created users
      }
    });

    await createAuditLog({
      tenantId: usuarioAdmin.tenantId,
      usuarioId: payload.userId,
      accion: "CREATE",
      entidad: "Usuario",
      entidadId: nuevoUsuario.id,
      detalles: {
        descripcion: "Usuario creado",
        despues: {
            username, email, nombre, apellido, rol, activo, empresaId
        },
      },
    });

    revalidatePath("/dashboard/usuarios");
    return { success: true, message: "Usuario creado exitosamente" };
  } catch (error) {
    console.error("Error creando usuario:", error);
    return { error: "Error interno al crear el usuario" };
  }
}

export async function getEmpresasOptions(token: string) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });
    if (!usuario) return { error: "Usuario no encontrado" };

    const empresas = await prisma.empresa.findMany({
      where: { tenantId: usuario.tenantId },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" }
    });

    return { empresas };
  } catch (error) {
    console.error("Error cargando empresas:", error);
    return { error: "Error al cargar empresas" };
  }
}

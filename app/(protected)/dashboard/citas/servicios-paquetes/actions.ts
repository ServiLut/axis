"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { EstadoPaquete, Prisma, Rol } from "@/prisma/generated/prisma/client";

const ADMIN_ROLES: Rol[] = [Rol.ADMIN, Rol.SU_ADMIN];

type AdminUser = {
  id: number;
  tenantId: number;
  rol: Rol;
};

type AdminContext =
  | { user: AdminUser }
  | { error: string };

const serializeValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return Number(value);
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        serializeValue(item),
      ]),
    );
  }
  return value;
};

const getAdminUser = async (token: string): Promise<AdminContext> => {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.userId },
    select: { id: true, tenantId: true, rol: true },
  });

  if (!usuario || !usuario.rol) return { error: "Usuario no encontrado" };
  if (!ADMIN_ROLES.includes(usuario.rol)) {
    return { error: "Acceso denegado" };
  }

  return {
    user: {
      id: usuario.id,
      tenantId: usuario.tenantId,
      rol: usuario.rol,
    },
  };
};

const getString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
};

const parseOptionalInt = (value: string) => {
  if (!value || value === "all" || value === "none" || value === "null") {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const parseRequiredInt = (value: string, fieldLabel: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldLabel} es obligatorio`);
  }
  return parsed;
};

const parseMoney = (value: string, fieldLabel: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldLabel} debe ser un valor mayor o igual a cero`);
  }
  return parsed;
};

const parseEstadoPaquete = (value: string) => {
  const estados = Object.values(EstadoPaquete);
  return estados.includes(value as EstadoPaquete)
    ? (value as EstadoPaquete)
    : EstadoPaquete.ACTIVO;
};

const tenantWhere = (
  user: AdminUser,
  requestedTenantId?: string,
): { tenantId?: number } => {
  if (user.rol !== Rol.SU_ADMIN) {
    return { tenantId: user.tenantId };
  }

  const parsedTenantId = parseOptionalInt(requestedTenantId || "");
  return parsedTenantId ? { tenantId: parsedTenantId } : {};
};

const terapiasCatalogWhere = (
  user: AdminUser,
  requestedTenantId?: string,
): { tenantId?: number } => {
  if (user.rol === Rol.SU_ADMIN) {
    const parsedTenantId = parseOptionalInt(requestedTenantId || "");
    return parsedTenantId ? { tenantId: parsedTenantId } : {};
  }

  // El flujo actual de citas del tenant de psicólogos carga TerapiasPsicologos
  // como catálogo global; mantenerlo igual evita ocultar datos existentes.
  if (user.tenantId === 4) return {};

  return { tenantId: user.tenantId };
};

const writableTenantId = (user: AdminUser, requestedTenantId: string) => {
  if (user.rol !== Rol.SU_ADMIN) return user.tenantId;
  return parseOptionalInt(requestedTenantId) || user.tenantId;
};

const getOwnedTerapia = async (
  id: number,
  user: AdminUser,
  targetTenantId?: number,
) => {
  return prisma.terapiasPsicologos.findFirst({
    where: {
      id: BigInt(id),
      ...(user.tenantId === 4
        ? {}
        : user.rol === Rol.SU_ADMIN && targetTenantId
        ? { tenantId: targetTenantId }
        : tenantWhere(user)),
    },
  });
};

const getOwnedPaquete = async (
  id: number,
  user: AdminUser,
  targetTenantId?: number,
) => {
  return prisma.paqueteAdquirido.findFirst({
    where: {
      id: BigInt(id),
      ...(user.rol === Rol.SU_ADMIN && targetTenantId
        ? { tenantId: targetTenantId }
        : tenantWhere(user)),
    },
  });
};

const validateClienteOwner = async (clienteId: number | null, tenantId: number) => {
  if (!clienteId) return null;

  const cliente = await prisma.cliente.findFirst({
    where: { id: clienteId, tenantId, deletedAt: null },
    select: { id: true },
  });

  if (!cliente) {
    throw new Error("El paciente seleccionado no pertenece al sistema");
  }

  return cliente.id;
};

const validateUsuarioOwner = async (usuarioId: number | null, tenantId: number) => {
  if (!usuarioId) return null;

  const usuario = await prisma.usuario.findFirst({
    where: { id: usuarioId, tenantId, activo: true },
    select: { id: true },
  });

  if (!usuario) {
    throw new Error("El psicólogo seleccionado no pertenece al sistema");
  }

  return usuario.id;
};

export async function getManagementOptions(token: string, tenantId?: string) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const targetTenantId =
      context.user.rol === Rol.SU_ADMIN
        ? parseOptionalInt(tenantId || "") || context.user.tenantId
        : context.user.tenantId;

    const [empresas, terapias, psicologos, tenants] = await Promise.all([
      prisma.empresa.findMany({
        where: { tenantId: targetTenantId },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
      prisma.terapiasPsicologos.findMany({
        where: {
          ...terapiasCatalogWhere(context.user, tenantId),
          activo: true,
        },
        select: {
          id: true,
          nombre: true,
          categoria: true,
          cantidadSesiones: true,
          precioBase: true,
        },
        orderBy: { nombre: "asc" },
      }),
      prisma.usuario.findMany({
        where: { tenantId: targetTenantId, rol: Rol.TECNICO, activo: true },
        select: { id: true, nombre: true, apellido: true },
        orderBy: [{ nombre: "asc" }, { apellido: "asc" }],
      }),
      context.user.rol === Rol.SU_ADMIN
        ? prisma.tenant.findMany({
            select: { id: true, nombre: true },
            orderBy: { id: "asc" },
          })
        : Promise.resolve([]),
    ]);

    return {
      empresas: serializeValue(empresas),
      terapias: serializeValue(terapias),
      psicologos: serializeValue(psicologos),
      tenants,
      currentTenantId: targetTenantId,
    };
  } catch (error) {
    console.error("Error cargando opciones:", error);
    return { error: "Error al cargar opciones" };
  }
}

export async function getTerapiasPsicologos(
  token: string,
  filters: { term?: string; estado?: string; tenantId?: string } = {},
) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const where: Prisma.TerapiasPsicologosWhereInput = {
      ...terapiasCatalogWhere(context.user, filters.tenantId),
    };

    if (filters.estado === "active") where.activo = true;
    if (filters.estado === "inactive") where.activo = false;

    if (filters.term?.trim()) {
      const term = filters.term.trim();
      where.OR = [
        { nombre: { contains: term, mode: "insensitive" } },
        { descripcion: { contains: term, mode: "insensitive" } },
        { categoria: { contains: term, mode: "insensitive" } },
        {
          Empresa_TerapiasPsicologos_empresaIdToEmpresa: {
            nombre: { contains: term, mode: "insensitive" },
          },
        },
      ];
    }

    const terapias = await prisma.terapiasPsicologos.findMany({
      where,
      include: {
        Empresa_TerapiasPsicologos_empresaIdToEmpresa: {
          select: { id: true, nombre: true },
        },
        Empresa_TerapiasPsicologos_tenantIdToEmpresa: {
          select: { id: true, nombre: true },
        },
        _count: {
          select: { PaqueteAdquirido: true },
        },
      },
      orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    });

    return { terapias: serializeValue(terapias) };
  } catch (error) {
    console.error("Error cargando terapias:", error);
    return { error: "Error al cargar servicios y terapias" };
  }
}

export async function createTerapiaPsicologos(
  token: string,
  formData: FormData,
) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const tenantId = writableTenantId(context.user, getString(formData, "tenantId"));
    const nombre = getString(formData, "nombre");
    const descripcion = getString(formData, "descripcion") || null;
    const categoria = getString(formData, "categoria") || null;
    const cantidadSesiones = parseRequiredInt(
      getString(formData, "cantidadSesiones"),
      "La cantidad de sesiones",
    );
    const precioBase = parseMoney(getString(formData, "precioBase"), "El precio base");
    const empresaId = parseOptionalInt(getString(formData, "empresaId"));
    const activo = getString(formData, "activo") !== "false";

    if (!nombre) return { error: "El nombre es obligatorio" };

    const nuevaTerapia = await prisma.terapiasPsicologos.create({
      data: {
        tenantId,
        empresaId,
        nombre,
        descripcion,
        categoria,
        cantidadSesiones,
        precioBase,
        activo,
      },
    });

    await createAuditLog({
      tenantId,
      usuarioId: context.user.id,
      accion: "CREATE",
      entidad: "TerapiaPsicologos",
      entidadId: Number(nuevaTerapia.id),
      detalles: {
        descripcion: "Servicio/terapia creado desde Gestión de Citas",
        despues: serializeValue(nuevaTerapia),
      },
    });

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/nuevo");
    revalidatePath("/dashboard/citas/servicios-paquetes");
    return { success: true, message: "Servicio creado correctamente" };
  } catch (error) {
    console.error("Error creando terapia:", error);
    const message = error instanceof Error ? error.message : "Error al crear el servicio";
    return { error: message };
  }
}

export async function updateTerapiaPsicologos(
  token: string,
  id: number,
  formData: FormData,
) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const targetTenantId = writableTenantId(context.user, getString(formData, "tenantId"));
    const terapiaPrevia = await getOwnedTerapia(id, context.user, targetTenantId);
    if (!terapiaPrevia) return { error: "Servicio no encontrado" };

    const nombre = getString(formData, "nombre");
    const descripcion = getString(formData, "descripcion") || null;
    const categoria = getString(formData, "categoria") || null;
    const cantidadSesiones = parseRequiredInt(
      getString(formData, "cantidadSesiones"),
      "La cantidad de sesiones",
    );
    const precioBase = parseMoney(getString(formData, "precioBase"), "El precio base");
    const empresaId = parseOptionalInt(getString(formData, "empresaId"));
    const activo = getString(formData, "activo") !== "false";

    if (!nombre) return { error: "El nombre es obligatorio" };

    const terapiaActualizada = await prisma.terapiasPsicologos.update({
      where: { id: BigInt(id) },
      data: {
        empresaId,
        nombre,
        descripcion,
        categoria,
        cantidadSesiones,
        precioBase,
        activo,
      },
    });

    await createAuditLog({
      tenantId: terapiaPrevia.tenantId,
      usuarioId: context.user.id,
      accion: "UPDATE",
      entidad: "TerapiaPsicologos",
      entidadId: id,
      detalles: {
        descripcion: "Servicio/terapia actualizado desde Gestión de Citas",
        antes: serializeValue(terapiaPrevia),
        despues: serializeValue(terapiaActualizada),
      },
    });

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/nuevo");
    revalidatePath("/dashboard/citas/servicios-paquetes");
    return { success: true, message: "Servicio actualizado correctamente" };
  } catch (error) {
    console.error("Error actualizando terapia:", error);
    const message =
      error instanceof Error ? error.message : "Error al actualizar el servicio";
    return { error: message };
  }
}

export async function toggleTerapiaPsicologosActivo(
  token: string,
  id: number,
  active: boolean,
) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const terapiaPrevia = await getOwnedTerapia(id, context.user);
    if (!terapiaPrevia) return { error: "Servicio no encontrado" };

    const terapiaActualizada = await prisma.terapiasPsicologos.update({
      where: { id: BigInt(id) },
      data: { activo: active },
    });

    await createAuditLog({
      tenantId: terapiaPrevia.tenantId,
      usuarioId: context.user.id,
      accion: active ? "UPDATE" : "DELETE",
      entidad: "TerapiaPsicologos",
      entidadId: id,
      detalles: {
        descripcion: active
          ? "Servicio/terapia reactivado"
          : "Servicio/terapia desactivado",
        antes: serializeValue(terapiaPrevia),
        despues: serializeValue(terapiaActualizada),
      },
    });

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/nuevo");
    revalidatePath("/dashboard/citas/servicios-paquetes");
    return {
      success: true,
      message: active ? "Servicio reactivado" : "Servicio desactivado",
    };
  } catch (error) {
    console.error("Error cambiando estado de terapia:", error);
    return { error: "Error al cambiar el estado del servicio" };
  }
}

export async function getPaquetesAdquiridos(
  token: string,
  filters: { term?: string; estado?: string; tenantId?: string } = {},
) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const where: Prisma.PaqueteAdquiridoWhereInput = {
      ...tenantWhere(context.user, filters.tenantId),
    };

    if (filters.estado && filters.estado !== "all") {
      where.estado = parseEstadoPaquete(filters.estado);
    }

    if (filters.term?.trim()) {
      const term = filters.term.trim();
      where.OR = [
        {
          TerapiasPsicologos: {
            nombre: { contains: term, mode: "insensitive" },
          },
        },
        {
          Cliente: {
            OR: [
              { nombre: { contains: term, mode: "insensitive" } },
              { apellido: { contains: term, mode: "insensitive" } },
              { numeroDocumento: { contains: term, mode: "insensitive" } },
              { telefono: { contains: term, mode: "insensitive" } },
            ],
          },
        },
        {
          Usuario: {
            OR: [
              { nombre: { contains: term, mode: "insensitive" } },
              { apellido: { contains: term, mode: "insensitive" } },
              { username: { contains: term, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    const paquetes = await prisma.paqueteAdquirido.findMany({
      where,
      include: {
        TerapiasPsicologos: {
          select: {
            id: true,
            nombre: true,
            categoria: true,
            cantidadSesiones: true,
            precioBase: true,
            activo: true,
          },
        },
        Cliente: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            tipoDocumento: true,
            numeroDocumento: true,
            telefono: true,
          },
        },
        Usuario: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            username: true,
          },
        },
        Tenant: {
          select: { id: true, nombre: true },
        },
        _count: {
          select: { CitasPsicologos: true },
        },
      },
      orderBy: [{ estado: "asc" }, { fechaCompra: "desc" }],
      take: 250,
    });

    return { paquetes: serializeValue(paquetes) };
  } catch (error) {
    console.error("Error cargando paquetes:", error);
    return { error: "Error al cargar paquetes" };
  }
}

const validatePackagePayload = async (
  formData: FormData,
  user: AdminUser,
) => {
  const tenantId = writableTenantId(user, getString(formData, "tenantId"));
  const catalogoId = BigInt(
    parseRequiredInt(getString(formData, "catalogoId"), "El servicio"),
  );
  const ownerType = getString(formData, "ownerType") || "CLIENTE";
  const sesionesTotales = parseRequiredInt(
    getString(formData, "sesionesTotales"),
    "Las sesiones totales",
  );
  const sesionesConsumidasRaw = getString(formData, "sesionesConsumidas") || "0";
  const sesionesConsumidas = parseOptionalInt(sesionesConsumidasRaw) ?? 0;
  const precioPagado = parseMoney(getString(formData, "precioPagado"), "El precio pagado");
  const fechaVencimientoRaw = getString(formData, "fechaVencimiento");
  const estado = parseEstadoPaquete(getString(formData, "estado"));

  if (sesionesConsumidas < 0) {
    throw new Error("Las sesiones consumidas no pueden ser negativas");
  }

  if (sesionesConsumidas > sesionesTotales) {
    throw new Error("Las sesiones consumidas no pueden superar las sesiones totales");
  }

  const terapia = await prisma.terapiasPsicologos.findFirst({
    where: { id: catalogoId, tenantId },
    select: { id: true },
  });

  if (!terapia) {
    throw new Error("El servicio seleccionado no pertenece al sistema");
  }

  const clienteId =
    ownerType === "CLIENTE"
      ? await validateClienteOwner(parseOptionalInt(getString(formData, "clienteId")), tenantId)
      : null;
  const usuarioId =
    ownerType === "PSICOLOGO"
      ? await validateUsuarioOwner(parseOptionalInt(getString(formData, "usuarioId")), tenantId)
      : null;

  if (!clienteId && !usuarioId) {
    throw new Error("Debe seleccionar un paciente o psicólogo para el paquete");
  }

  return {
    tenantId,
    catalogoId,
    clienteId,
    usuarioId,
    sesionesTotales,
    sesionesConsumidas,
    saldoRestante: sesionesTotales - sesionesConsumidas,
    precioPagado,
    fechaVencimiento: fechaVencimientoRaw
      ? new Date(`${fechaVencimientoRaw}T23:59:59.999-05:00`)
      : null,
    estado,
  };
};

export async function createPaqueteAdquirido(
  token: string,
  formData: FormData,
) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const payload = await validatePackagePayload(formData, context.user);

    const nuevoPaquete = await prisma.paqueteAdquirido.create({
      data: {
        tenantId: payload.tenantId,
        clienteId: payload.clienteId,
        usuarioId: payload.usuarioId,
        catalogoId: payload.catalogoId,
        sesionesTotales: payload.sesionesTotales,
        sesionesConsumidas: payload.sesionesConsumidas,
        saldoRestante: payload.saldoRestante,
        fechaCompra: new Date(),
        fechaVencimiento: payload.fechaVencimiento,
        precioPagado: payload.precioPagado,
        estado: payload.estado,
      },
    });

    await createAuditLog({
      tenantId: payload.tenantId,
      usuarioId: context.user.id,
      accion: "CREATE",
      entidad: "PaqueteAdquirido",
      entidadId: Number(nuevoPaquete.id),
      detalles: {
        descripcion: "Paquete creado desde Gestión de Citas",
        despues: serializeValue(nuevoPaquete),
      },
    });

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/servicios-paquetes");
    return { success: true, message: "Paquete creado correctamente" };
  } catch (error) {
    console.error("Error creando paquete:", error);
    const message = error instanceof Error ? error.message : "Error al crear el paquete";
    return { error: message };
  }
}

export async function updatePaqueteAdquirido(
  token: string,
  id: number,
  formData: FormData,
) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const payload = await validatePackagePayload(formData, context.user);
    const paquetePrevio = await getOwnedPaquete(id, context.user, payload.tenantId);
    if (!paquetePrevio) return { error: "Paquete no encontrado" };

    const paqueteActualizado = await prisma.paqueteAdquirido.update({
      where: { id: BigInt(id) },
      data: {
        clienteId: payload.clienteId,
        usuarioId: payload.usuarioId,
        catalogoId: payload.catalogoId,
        sesionesTotales: payload.sesionesTotales,
        sesionesConsumidas: payload.sesionesConsumidas,
        saldoRestante: payload.saldoRestante,
        fechaVencimiento: payload.fechaVencimiento,
        precioPagado: payload.precioPagado,
        estado: payload.estado,
      },
    });

    await createAuditLog({
      tenantId: paquetePrevio.tenantId,
      usuarioId: context.user.id,
      accion: "UPDATE",
      entidad: "PaqueteAdquirido",
      entidadId: id,
      detalles: {
        descripcion: "Paquete actualizado desde Gestión de Citas",
        antes: serializeValue(paquetePrevio),
        despues: serializeValue(paqueteActualizado),
      },
    });

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/servicios-paquetes");
    return { success: true, message: "Paquete actualizado correctamente" };
  } catch (error) {
    console.error("Error actualizando paquete:", error);
    const message =
      error instanceof Error ? error.message : "Error al actualizar el paquete";
    return { error: message };
  }
}

export async function cancelPaqueteAdquirido(token: string, id: number) {
  const context = await getAdminUser(token);
  if ("error" in context) return context;

  try {
    const paquetePrevio = await getOwnedPaquete(id, context.user);
    if (!paquetePrevio) return { error: "Paquete no encontrado" };

    const paqueteActualizado = await prisma.paqueteAdquirido.update({
      where: { id: BigInt(id) },
      data: { estado: EstadoPaquete.CANCELADO },
    });

    await createAuditLog({
      tenantId: paquetePrevio.tenantId,
      usuarioId: context.user.id,
      accion: "DELETE",
      entidad: "PaqueteAdquirido",
      entidadId: id,
      detalles: {
        descripcion: "Paquete cancelado desde Gestión de Citas",
        antes: serializeValue(paquetePrevio),
        despues: serializeValue(paqueteActualizado),
      },
    });

    revalidatePath("/dashboard/citas");
    revalidatePath("/dashboard/citas/servicios-paquetes");
    return { success: true, message: "Paquete cancelado correctamente" };
  } catch (error) {
    console.error("Error cancelando paquete:", error);
    return { error: "Error al cancelar el paquete" };
  }
}

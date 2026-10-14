"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/prisma/generated/prisma/client";
import { clientPhoneVariants, normalizeClientPhone } from "@/lib/client-phone";
import { PSYCHOLOGY_TENANT_ID } from "@/lib/constants/tenants";

const formatValue = (val: string | null | undefined) => {
  if (!val || val.trim() === "" || val === "null" || val === "undefined") {
    return "No Concretado";
  }
  return val.trim();
};

interface DireccionInput {
  tenantId: number;
  direccion: string;
  barrio: string | null;
  municipio: string | null;
  piso: string | null;
  bloque: string | null;
  unidad: string | null;
  linkMaps?: string | null;
}

interface VehiculoInput {
  tenantId: number;
  placa: string;
  marca: string | null;
  modelo: string | null;
  color: string | null;
  tipo: string | null;
}

export async function createCliente(token: string, formData: FormData) {
  const payload = await verifyToken(token);

  if (!payload) {
    return { error: "No autorizado. Por favor inicie sesión nuevamente." };
  }

  // Obtener el tenantId del usuario
  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
    select: { tenantId: true },
  });

  if (!usuario) {
    return { error: "Usuario no encontrado." };
  }

  const nombre = formData.get("nombre") as string;
  const apellido = formData.get("apellido") as string;
  const tipoDocumento = formData.get("tipoDocumento") as string;
  const numeroDocumento = formData.get("numeroDocumento") as string;
  let telefono = formData.get("telefono") as string;
  let telefono2 = formData.get("telefono2") as string;
  const correo = formData.get("correo") as string;
  const registroDocumento = formData.get("registroDocumento") as string;
  const documentoPath = formData.get("documentoPath") as string;
  const direccionesJson = formData.get("direcciones") as string;
  const vehiculosJson = formData.get("vehiculos") as string;

  if (!telefono || !telefono.trim()) return { error: "El teléfono es obligatorio." };

  if (usuario.tenantId === PSYCHOLOGY_TENANT_ID) {
    try {
      telefono = normalizeClientPhone(telefono);
      telefono2 = normalizeClientPhone(telefono2 || "");
      if (!telefono) return { error: "El teléfono es obligatorio." };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Teléfono inválido" };
    }
  }

  // Verificar si ya existe un cliente con el mismo teléfono (primario o secundario)
  const orConditions: Prisma.ClienteWhereInput[] = [
      { telefono: telefono.trim() },
      { telefono2: telefono.trim() }
  ];

  if (telefono2 && telefono2.trim()) {
      orConditions.push({ telefono: telefono2.trim() });
      orConditions.push({ telefono2: telefono2.trim() });
  }

  if (usuario.tenantId === PSYCHOLOGY_TENANT_ID) {
    const variants = [...new Set([...clientPhoneVariants(telefono), ...clientPhoneVariants(telefono2)])];
    orConditions.push({ telefono: { in: variants } }, { telefono2: { in: variants } });
  }

  const existingCliente = await prisma.cliente.findFirst({
    where: {
      tenantId: PSYCHOLOGY_TENANT_ID,
      deletedAt: null,
      OR: orConditions
    },
  });

  if (existingCliente) {
    return { error: "Ya existe un paciente registrado con este número de teléfono." };
  }

  let direccionesData: DireccionInput[] = [];
  try {
    if (direccionesJson) {
      const parsed = JSON.parse(direccionesJson);
      if (Array.isArray(parsed)) {
        for (const d of parsed) {
          if (!d.direccion || !d.direccion.trim()) {
            return { error: "La dirección es obligatoria en todas las direcciones registradas." };
          }
        }
        direccionesData = parsed.map((d: {
          direccion: string;
          barrio?: string;
          municipio?: string;
          piso?: string;
          bloque?: string;
          unidad?: string;
          linkMaps?: string;
        }) => ({
          tenantId: PSYCHOLOGY_TENANT_ID,
          direccion: d.direccion,
          barrio: formatValue(d.barrio),
          municipio: formatValue(d.municipio),
          piso: formatValue(d.piso),
          bloque: formatValue(d.bloque),
          unidad: formatValue(d.unidad),
          linkMaps: formatValue(d.linkMaps),
        }));
      }
    }
  } catch (e) {
    console.error("Error parsing direcciones:", e);
    return { error: "Error al procesar las direcciones." };
  }

  let vehiculosData: VehiculoInput[] = [];
  try {
    if (vehiculosJson) {
      const parsed = JSON.parse(vehiculosJson);
      if (Array.isArray(parsed)) {
        vehiculosData = parsed.map((v: {
          placa: string;
          marca?: string;
          modelo?: string;
          color?: string;
          tipo?: string;
        }) => ({
          tenantId: PSYCHOLOGY_TENANT_ID,
          placa: formatValue(v.placa),
          marca: formatValue(v.marca),
          modelo: formatValue(v.modelo),
          color: formatValue(v.color),
          tipo: formatValue(v.tipo),
        }));
      }
    }
  } catch (e) {
    console.error("Error parsing vehiculos:", e);
    return { error: "Error al procesar los vehículos." };
  }

  try {
    const newCliente = await prisma.cliente.create({
      data: {
        tenantId: PSYCHOLOGY_TENANT_ID,
        nombre: formatValue(nombre),
        apellido: formatValue(apellido),
        tipoDocumento: formatValue(tipoDocumento),
        numeroDocumento: formatValue(numeroDocumento),
        telefono,
        telefono2: formatValue(telefono2) || null,
        correo: (!correo || !correo.trim()) ? "noconcretado@noconcretado.com" : correo.trim(),
        registroDocumento: formatValue(registroDocumento) || null,
        documentoPath: formatValue(documentoPath) || null,
        direcciones: {
          create: direccionesData,
        },
        vehiculos: {
          create: vehiculosData,
        },
      },
    });

    revalidatePath("/dashboard/clientes");
    return { success: true, message: "Paciente creado exitosamente.", clienteId: newCliente.id };
  } catch (error) {
    console.error("Error creando paciente:", error);
    return { error: "Error al crear el paciente." };
  }
}

export async function getClientForMigration(token: string, clientId: number) {
  const payload = await verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    // 1. Get Client and existing addresses
    const cliente = await prisma.cliente.findFirst({
      where: { id: clientId, tenantId: PSYCHOLOGY_TENANT_ID },
      include: {
        direcciones: true,
        vehiculos: true,
      },
    });

    if (!cliente) return { error: "Paciente no encontrado" };

    // 2. Get addresses from Orders (history)
    const ordenes = await prisma.ordenServicio.findMany({
      where: { clienteId: clientId, tenantId: PSYCHOLOGY_TENANT_ID },
      select: {
        direccionTexto: true,
        municipio: true,
        barrio: true,
        piso: true,
        bloque: true,
        unidad: true,
        direccionId: true, // To exclude linked ones
      },
    });

    // 3. Extract unique addresses that are NOT linked (direccionId is null)
    // and are NOT exact duplicates of existing client.direcciones
    const existingDirStrings = new Set(
      cliente.direcciones.map(d => 
        `${d.direccion}|${d.municipio || ''}|${d.barrio || ''}|${d.piso || ''}|${d.bloque || ''}|${d.unidad || ''}`.toLowerCase()
      )
    );

    const hiddenDirecciones = [];
    const seenHidden = new Set();

    for (const ord of ordenes) {
      if (ord.direccionId) continue; // Already linked

      const key = `${ord.direccionTexto}|${ord.municipio || ''}|${ord.barrio || ''}|${ord.piso || ''}|${ord.bloque || ''}|${ord.unidad || ''}`.toLowerCase();
      
      if (!existingDirStrings.has(key) && !seenHidden.has(key)) {
        seenHidden.add(key);
        hiddenDirecciones.push({
          direccion: ord.direccionTexto,
          municipio: ord.municipio,
          barrio: ord.barrio,
          piso: ord.piso,
          bloque: ord.bloque,
          unidad: ord.unidad,
        });
      }
    }

    return { 
      cliente, 
      hiddenDirecciones 
    };

  } catch (error) {
    console.error("Error fetching migration data:", error);
    return { error: "Error cargando datos del paciente" };
  }
}

export async function getServilutionClientForMigration(token: string, clientId: number) {
  void clientId; // Preserve the action signature for previous callers.
  const payload = await verifyToken(token);
  if (!payload) return { error: "No autorizado" };
  return { error: "La importación desde otras empresas está deshabilitada. Registra el paciente en Psicólogos en Colombia." };
}

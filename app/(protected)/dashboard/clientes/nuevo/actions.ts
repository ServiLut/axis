"use server";

import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import mysql from "@/lib/mysql";
import { Prisma } from "@/prisma/generated/prisma/client";

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
  const payload = verifyToken(token);

  if (!payload) {
    return { error: "No autorizado. Por favor inicie sesión nuevamente." };
  }

  // Obtener el tenantId del usuario
  const usuario = await prisma.usuario.findUnique({
    where: { id: payload.userId },
    select: { tenantId: true },
  });

  if (!usuario) {
    return { error: "Usuario no encontrado." };
  }

  const nombre = formData.get("nombre") as string;
  const apellido = formData.get("apellido") as string;
  const tipoDocumento = formData.get("tipoDocumento") as string;
  const numeroDocumento = formData.get("numeroDocumento") as string;
  const telefono = formData.get("telefono") as string;
  const telefono2 = formData.get("telefono2") as string;
  const correo = formData.get("correo") as string;
  const registroDocumento = formData.get("registroDocumento") as string;
  const documentoPath = formData.get("documentoPath") as string;
  const direccionesJson = formData.get("direcciones") as string;
  const vehiculosJson = formData.get("vehiculos") as string;

  if (!telefono || !telefono.trim()) return { error: "El teléfono es obligatorio." };

  // Verificar si ya existe un cliente con el mismo teléfono (primario o secundario)
  const orConditions: Prisma.ClienteWhereInput[] = [
      { telefono: telefono.trim() },
      { telefono2: telefono.trim() }
  ];

  if (telefono2 && telefono2.trim()) {
      orConditions.push({ telefono: telefono2.trim() });
      orConditions.push({ telefono2: telefono2.trim() });
  }

  const existingCliente = await prisma.cliente.findFirst({
    where: {
      tenantId: usuario.tenantId,
      deletedAt: null,
      OR: orConditions
    },
  });

  if (existingCliente) {
    return { error: "Ya existe un cliente registrado con este número de teléfono." };
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
          tenantId: usuario.tenantId,
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
          tenantId: usuario.tenantId,
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
        tenantId: usuario.tenantId,
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
    return { success: true, message: "Cliente creado exitosamente.", clienteId: newCliente.id };
  } catch (error) {
    console.error("Error creando cliente:", error);
    return { error: "Error al crear el cliente." };
  }
}

export async function getClientForMigration(token: string, clientId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.userId },
      select: { tenantId: true },
    });

    if (!usuario) return { error: "Usuario no encontrado" };

    // 1. Get Client and existing addresses
    const cliente = await prisma.cliente.findFirst({
      where: { id: clientId, tenantId: usuario.tenantId },
      include: {
        direcciones: true,
        vehiculos: true,
      },
    });

    if (!cliente) return { error: "Cliente no encontrado" };

    // 2. Get addresses from Orders (history)
    const ordenes = await prisma.ordenServicio.findMany({
      where: { clienteId: clientId, tenantId: usuario.tenantId },
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
    return { error: "Error cargando datos del cliente" };
  }
}

export async function getServilutionClientForMigration(token: string, clientId: number) {
  const payload = verifyToken(token);
  if (!payload) return { error: "No autorizado" };

  try {
    // 1. Get Client from MySQL
    const clientRows = await mysql.query<{
        Id_cliente: number;
        nombre: string;
        apellido: string;
        numero_de_documento: string;
        telefono: string;
        correo_electronico: string;
        direccion: string;
        municipio: number;
        barrio: number;
        numero_piso: string;
        bloque: string;
        unidad_residencial: string;
        nombre_municipio: string;
        nombre_barrio: string;
    }>(`
        SELECT 
            c.*, 
            m.Nombre as nombre_municipio,
            b.Nombre as nombre_barrio
        FROM clientes c
        LEFT JOIN municipios m ON c.municipio = m.id_municipio
        LEFT JOIN barrios b ON c.barrio = b.id_barrio
        WHERE c.Id_cliente = ?
    `, [clientId]);

    if (!clientRows || clientRows.length === 0) {
        return { error: "Cliente no encontrado en Servilution" };
    }

    const cliente = clientRows[0];
    if (!cliente) {
        return { error: "Error al procesar datos del cliente" };
    }
    
    // Check for existing client in new system (sanitize document first)
    // Legacy DB might have "900265730-0", new DB has "9002657300"
    const rawDoc = cliente.numero_de_documento || "";
    const sanitizedDoc = rawDoc.replace(/\D/g, "");

    if (sanitizedDoc) {
        // Get user for tenant context
        const usuario = await prisma.usuario.findUnique({
            where: { id: payload.userId },
            select: { tenantId: true },
        });

        if (usuario) {
            const existingClient = await prisma.cliente.findFirst({
                where: {
                    tenantId: usuario.tenantId,
                    numeroDocumento: sanitizedDoc,
                    deletedAt: null
                },
                select: { id: true }
            });

            if (existingClient) {
                return { 
                    error: "Este cliente ya ha sido migrado previamente.", 
                    existingClientId: existingClient.id 
                };
            }
        }
    }

    // 2. Get addresses from Orders (history)
    const ordenesRows = await mysql.query<{
        direccion_servicio: string;
        numero_piso: string;
        bloque_o_torre: string;
        unidad_residencial: string;
        nombre_municipio: string;
        nombre_barrio: string;
    }>(`
        SELECT 
            sp.direccion_servicio,
            sp.numero_piso,
            sp.bloque_o_torre,
            sp.unidad_residencial,
            m.Nombre as nombre_municipio,
            b.Nombre as nombre_barrio
        FROM servicios_prestados sp
        LEFT JOIN municipios m ON sp.id_municipio = m.id_municipio
        LEFT JOIN barrios b ON sp.id_barrio = b.id_barrio
        WHERE sp.id_cliente = ? AND sp.direccion_servicio IS NOT NULL AND sp.direccion_servicio != ''
    `, [clientId]);

    // 3. Extract unique addresses
    const hiddenDirecciones = [];
    const seenHidden = new Set();
    
    // Add the main address to seen set if it exists
    if (cliente.direccion) {
        const mainKey = `${cliente.direccion}|${cliente.nombre_municipio || ''}|${cliente.nombre_barrio || ''}|${cliente.numero_piso || ''}|${cliente.bloque || ''}|${cliente.unidad_residencial || ''}`.toLowerCase();
        seenHidden.add(mainKey);
    }

    for (const ord of ordenesRows) {
      const key = `${ord.direccion_servicio}|${ord.nombre_municipio || ''}|${ord.nombre_barrio || ''}|${ord.numero_piso || ''}|${ord.bloque_o_torre || ''}|${ord.unidad_residencial || ''}`.toLowerCase();
      
      if (!seenHidden.has(key)) {
        seenHidden.add(key);
        hiddenDirecciones.push({
          direccion: ord.direccion_servicio,
          municipio: ord.nombre_municipio,
          barrio: ord.nombre_barrio,
          piso: ord.numero_piso,
          bloque: ord.bloque_o_torre,
          unidad: ord.unidad_residencial,
        });
      }
    }

    return { 
      cliente: {
          ...cliente,
          tipoDocumento: 'CC', // Default, as old DB might store it differently or loosely
          numeroDocumento: cliente.numero_de_documento,
          telefono: cliente.telefono,
          telefono2: null,
          correo: cliente.correo_electronico
      }, 
      hiddenDirecciones 
    };

  } catch (error) {
    console.error("Error fetching Servilution migration data:", error);
    return { error: "Error cargando datos del cliente de Servilution" };
  }
}

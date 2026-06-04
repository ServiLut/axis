"use server";

import tecnicos from "@/lib/tecnicos";
import type { clientes as Cliente } from "../../../../../prisma/generated/prisma-tecnicos/client";

export async function getClienteDetails(id: number) {
  try {
    // 1. Get Client Info
    // Direct query for specific client to get all details including joined location names if needed
    const [cliente] = await tecnicos.query<Cliente & { nombre_municipio: string, nombre_departamento: string, nombre_barrio: string }>(`
      SELECT c.*, m.Nombre as nombre_municipio, d.Nombre as nombre_departamento, b.Nombre as nombre_barrio
      FROM clientes c
      LEFT JOIN municipios m ON c.municipio = m.id_municipio
      LEFT JOIN departamentos d ON c.departamento = d.id_departamento
      LEFT JOIN barrios b ON c.barrio = b.id_barrio
      WHERE c.Id_cliente = ?
    `, [id]);

    if (!cliente) {
      return { error: "Cliente no encontrado" };
    }

    // 2. Get Service History
    const { data: servicios } = await tecnicos.servicios_prestados.findMany({
      where: {
        id_cliente: id
      },
      take: 50 // Limit history to last 50 for now
    });

    return {
      cliente,
      servicios
    };

  } catch (error) {
    console.error("Error fetching client details:", error);
    return { error: "Error al obtener los detalles del cliente" };
  }
}

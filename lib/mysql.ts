import mysql2 from 'mysql2/promise';
// Importamos los tipos generados para mantener el tipado fuerte
import type { 
  clientes as Cliente, 
  servicios_prestados as ServicioPrestado,
  // servicios as ServicioTipo // Removed unused import
} from '../prisma/generated/prisma-mysql/client';

// Configuración del pool (la que sabemos que funciona)
const connectionString = process.env.DATABASE_URL_MYSQL;
const url = new URL(connectionString!);

// Use a global variable to store the pool instance to prevent multiple pools in dev
const globalForMysql = globalThis as unknown as { mysqlPool: mysql2.Pool };

const pool = globalForMysql.mysqlPool || mysql2.createPool({
  host: url.hostname,
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  port: parseInt(url.port) || 3306,
  connectionLimit: 5,
  // ssl: false, // mysql2 handles this differently, usually omitted for no-ssl or object for ssl
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

if (process.env.NODE_ENV !== 'production') globalForMysql.mysqlPool = pool;

type QueryParam = string | number | boolean | Date | null | undefined;

// Helper para ejecutar queries con tipado
export async function query<T = unknown>(sql: string, params?: QueryParam[]): Promise<T[]> {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query(sql, params);
    return rows as T[];
  } catch (err) {
    console.error('MySQL Query Error:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

interface WhereCondition {
  contains?: string;
}

interface ClientFilter {
  nombre?: WhereCondition;
  apellido?: WhereCondition;
  numero_de_documento?: WhereCondition;
  telefono?: WhereCondition;
}

interface ClientWhereInput {
  OR?: ClientFilter[];
  municipio?: number | string;
}

interface ClientFindManyArgs {
  take?: number;
  skip?: number;
  orderBy?: unknown;
  where?: ClientWhereInput;
}

interface ServiceFilter {
  fecha_visita?: { gte?: string | Date; lte?: string | Date };
  clientes?: { OR?: ClientFilter[] };
  id_cliente?: number;
  id_empresa?: number;
  id_municipio?: number | string;
  id_fumigador?: number;
}

interface ServiceFindManyArgs {
  take?: number;
  skip?: number;
  orderBy?: unknown;
  include?: unknown;
  where?: ServiceFilter;
}

interface CountResult {
  total: number;
}

interface FilterOptionsResult {
  municipios?: Array<{ id_municipio: number; Nombre: string }>;
  empresas?: Array<{ id: number; nombre: string }>;
  tecnicos?: Array<{ id: number; nombre: string; apellido: string }>;
}

// Objeto compatible para exportar, con métodos específicos si se desea
// o simplemente exportamos el query helper.
const mysql = {
  query,
  // Helper específico para clientes similar a Prisma
  clientes: {
    findMany: async (args?: ClientFindManyArgs) => {
      const baseSql = `
        FROM clientes c
        LEFT JOIN municipios m ON c.municipio = m.id_municipio
      `;
      const params: QueryParam[] = [];
      const conditions: string[] = [];
      
      if (args?.where) {
        if (args.where.OR) {
          const orConditions: string[] = [];
          args.where.OR.forEach((condition) => {
            if (condition.nombre?.contains) {
              orConditions.push('c.nombre LIKE ?');
              params.push(`%${condition.nombre.contains}%`);
            }
            if (condition.apellido?.contains) {
              orConditions.push('c.apellido LIKE ?');
              params.push(`%${condition.apellido.contains}%`);
            }
            if (condition.numero_de_documento?.contains) {
              orConditions.push('c.numero_de_documento LIKE ?');
              params.push(`%${condition.numero_de_documento.contains}%`);
            }
            if (condition.telefono?.contains) {
              orConditions.push('c.telefono LIKE ?');
              params.push(`%${condition.telefono.contains}%`);
            }
          });
          if (orConditions.length > 0) {
            conditions.push(`(${orConditions.join(' OR ')})`);
          }
        }

        if (args.where.municipio) {
            conditions.push('c.municipio = ?');
            params.push(args.where.municipio);
        }
      }

      let whereClause = '';
      if (conditions.length > 0) {
        whereClause = ` WHERE ${conditions.join(' AND ')}`;
      }

      const countSql = `SELECT COUNT(*) as total ${baseSql} ${whereClause}`;
      let dataSql = `
        SELECT c.*, m.Nombre as nombre_municipio 
        ${baseSql} ${whereClause} 
        ORDER BY c.Id_cliente DESC
      `;

      if (args?.take) {
        dataSql += ` LIMIT ${args.take}`;
        if (args?.skip) {
            dataSql += ` OFFSET ${args.skip}`;
        }
      }
      
      const countRows = await query<CountResult>(countSql, params);
      const rows = await query<Cliente & { nombre_municipio: string }>(dataSql, params);
      
      return {
          data: rows,
          total: Number(countRows[0]?.total || 0)
      };
    },
    getFilterOptions: async (): Promise<FilterOptionsResult> => {
        const municipios = await query<{ id_municipio: number; Nombre: string }>('SELECT DISTINCT id_municipio, Nombre FROM municipios ORDER BY Nombre');
        return { municipios };
    }
  },
  // Helper específico para servicios_prestados
  servicios_prestados: {
    findMany: async (args?: ServiceFindManyArgs) => {
      // Query con JOINs manuales para simular el include de Prisma
      const baseSql = `
        FROM servicios_prestados sp
        LEFT JOIN clientes c ON sp.id_cliente = c.Id_cliente
        LEFT JOIN servicios s ON sp.id_servicio = s.id
        LEFT JOIN empresa e ON sp.id_empresa = e.id
        LEFT JOIN perfil_trabajador pt ON sp.id_fumigador = pt.id
        LEFT JOIN municipios m ON sp.id_municipio = m.id_municipio
        LEFT JOIN barrios b ON sp.id_barrio = b.id_barrio
        LEFT JOIN metodos_de_pago mp ON sp.id_metodo_de_pago = mp.id
        LEFT JOIN zonas_locativas zl ON sp.id_zona_locativa = zl.id_zona
        LEFT JOIN estado_inicial_servicio eis ON sp.id_estado_inicial = eis.id_inicial
        LEFT JOIN estado_servicio es ON sp.id_estado_servicio = es.id_estado_servicio
      `;
      
      const params: QueryParam[] = [];
      const conditions: string[] = [];

      if (args?.where) {
        if (args.where.fecha_visita) {
            // Rango de fechas
            if (args.where.fecha_visita.gte) {
                conditions.push('sp.fecha_visita >= ?');
                params.push(args.where.fecha_visita.gte);
            }
            if (args.where.fecha_visita.lte) {
                conditions.push('sp.fecha_visita <= ?');
                params.push(args.where.fecha_visita.lte);
            }
        }
        
        // Búsqueda por cliente
        if (args.where.clientes?.OR) {
             const clientConditions: string[] = [];
             args.where.clientes.OR.forEach((cond) => {
                 if (cond.nombre?.contains) {
                     clientConditions.push('c.nombre LIKE ?');
                     params.push(`%${cond.nombre.contains}%`);
                 }
                 if (cond.apellido?.contains) {
                     clientConditions.push('c.apellido LIKE ?');
                     params.push(`%${cond.apellido.contains}%`);
                 }
             });
             if (clientConditions.length > 0) {
                 conditions.push(`(${clientConditions.join(' OR ')})`);
             }
        }

        // Filtros adicionales
        if (args.where.id_cliente) {
          conditions.push('sp.id_cliente = ?');
          params.push(args.where.id_cliente);
        }
        if (args.where.id_empresa) {
          conditions.push('sp.id_empresa = ?');
          params.push(args.where.id_empresa);
        }
        if (args.where.id_municipio) {
            // Nota: id_municipio en sp es Int, pero a veces se filtra por nombre si la UI lo manda
            // Asumiremos que el filtro viene por ID si es número
            conditions.push('sp.id_municipio = ?');
            params.push(args.where.id_municipio);
        }
        if (args.where.id_fumigador) {
            conditions.push('sp.id_fumigador = ?');
            params.push(args.where.id_fumigador);
        }
      }

      let whereClause = '';
      if (conditions.length > 0) {
        whereClause = ` WHERE ${conditions.join(' AND ')}`;
      }

      // Count total query
      const countSql = `SELECT COUNT(*) as total ${baseSql} ${whereClause}`;
      
      // Data query
      let dataSql = `
        SELECT 
          sp.*,
          c.nombre as cliente_nombre, c.apellido as cliente_apellido,
          s.servicio as servicio_nombre,
          e.nombre as empresa_nombre,
          pt.nombre as tecnico_nombre, pt.apellido as tecnico_apellido,
          m.Nombre as municipio_nombre,
          b.Nombre as barrio_nombre,
          mp.metodo_pago as metodo_pago_nombre,
          zl.zona as zona_nombre,
          eis.estado as estado_inicial_nombre,
          es.estado_servicio as estado_servicio_nombre
        ${baseSql} ${whereClause}
        ORDER BY sp.id DESC
      `;
      
      if (args?.take) {
        dataSql += ` LIMIT ${args.take}`;
        if (args?.skip) {
            dataSql += ` OFFSET ${args.skip}`;
        }
      }
      
      // Ejecutar en paralelo (cuando el pool lo permita, ahora secuencial para seguridad)
      const countRows = await query<CountResult>(countSql, params);
      
      interface ServiceRow extends ServicioPrestado {
        cliente_nombre: string;
        cliente_apellido: string;
        servicio_nombre: string;
        empresa_nombre: string;
        tecnico_nombre: string;
        tecnico_apellido: string;
        municipio_nombre: string;
        barrio_nombre: string;
        metodo_pago_nombre: string;
        zona_nombre: string;
        estado_inicial_nombre: string;
        estado_servicio_nombre: string;
      }
      
      const rows = await query<ServiceRow>(dataSql, params);
      
      const total = Number(countRows[0]?.total || 0);

      // Define return type explicitly
      // Omit Decimal fields to redefine them as number | null
      interface ServiceWithRelations extends Omit<ServicioPrestado, 'valor_pagado' | 'valor_cotizacion' | 'valor_repuestos'> {
        valor_pagado: number | null;
        valor_cotizacion: number | null;
        valor_repuestos: number | null;
        clientes: {
          nombre: string | null;
          apellido: string | null;
        };
        servicios: {
          servicio: string | null;
        };
        empresa: {
            nombre: string | null;
        };
        perfil_trabajador: {
            nombre: string | null;
            apellido: string | null;
        };
        municipios: {
            Nombre: string | null;
        };
        barrios: {
            Nombre: string | null;
        };
        metodos_de_pago: {
            metodo_pago: string | null;
        };
        zonas_locativas: {
            zona: string | null;
        };
        estado_inicial_servicio: {
            estado: string | null;
        };
        estado_servicio: {
            estado_servicio: string | null;
        };
      }

      // Mapear resultados
      const data: ServiceWithRelations[] = rows.map(row => ({
        ...row,
        valor_pagado: row.valor_pagado !== null ? Number(row.valor_pagado) : null,
        valor_cotizacion: row.valor_cotizacion !== null ? Number(row.valor_cotizacion) : null,
        valor_repuestos: row.valor_repuestos !== null ? Number(row.valor_repuestos) : null,
        clientes: {
          nombre: row.cliente_nombre,
          apellido: row.cliente_apellido
        },
        servicios: {
          servicio: row.servicio_nombre
        },
        empresa: {
            nombre: row.empresa_nombre
        },
        perfil_trabajador: { // Técnico
            nombre: row.tecnico_nombre,
            apellido: row.tecnico_apellido
        },
        municipios: {
            Nombre: row.municipio_nombre
        },
        barrios: {
            Nombre: row.barrio_nombre
        },
        metodos_de_pago: {
            metodo_pago: row.metodo_pago_nombre
        },
        zonas_locativas: {
            zona: row.zona_nombre
        },
        estado_inicial_servicio: {
            estado: row.estado_inicial_nombre
        },
        estado_servicio: {
            estado_servicio: row.estado_servicio_nombre
        }
      }));

      return { data, total };
    },
    // Métodos auxiliares para filtros
    getFilterOptions: async (): Promise<FilterOptionsResult> => {
        const empresas = await query<{ id: number; nombre: string }>('SELECT id, nombre FROM empresa WHERE nombre IS NOT NULL ORDER BY nombre');
        const municipios = await query<{ id_municipio: number; Nombre: string }>('SELECT DISTINCT id_municipio, Nombre FROM municipios ORDER BY Nombre');
        // Filtramos perfil_trabajador por rol si es necesario, o traemos todos
        const tecnicos = await query<{ id: number; nombre: string; apellido: string }>('SELECT id, nombre, apellido FROM perfil_trabajador WHERE nombre IS NOT NULL ORDER BY nombre');
        
        return { empresas, municipios, tecnicos };
    }
  }
};

export default mysql;
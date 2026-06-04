import mysql2 from 'mysql2/promise';
// Import Prisma generated types for type safety
import type { 
  clientes as Cliente, 
  servicios_prestados as ServicioPrestado 
} from '../prisma/generated/prisma-tecnicos/client';

const connectionString = process.env.DATABASE_URL_MYSQL_TECNICOS;
const url = new URL(connectionString!);

// Use a global variable to store the pool instance to prevent multiple pools in dev
const globalForTecnicos = globalThis as unknown as { tecnicosPool: mysql2.Pool };

const pool = globalForTecnicos.tecnicosPool || mysql2.createPool({
  host: url.hostname,
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  port: parseInt(url.port) || 3306,
  connectionLimit: 5,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

if (process.env.NODE_ENV !== 'production') globalForTecnicos.tecnicosPool = pool;

type QueryParam = string | number | boolean | Date | null | undefined;

// Helper para ejecutar queries con tipado
export async function query<T = unknown>(sql: string, params?: QueryParam[]): Promise<T[]> {
  let conn;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query(sql, params);
    return rows as T[];
  } catch (err) {
    console.error('MySQL Tecnicos Query Error:', err);
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

// Extender tipos base para incluir alias de los queries
interface ClienteWithLocation extends Cliente {
  nombre_municipio?: string;
}

interface ServicioRow extends ServicioPrestado {
  cliente_nombre: string;
  cliente_apellido: string;
  servicio_nombre: string;
  empresa_nombre: string;
  tecnico_nombre: string;
  tecnico_apellido: string;
  municipio_nombre: string;
  barrio_nombre: string;
  metodo_pago_nombre: string;
  estado_servicio_nombre: string;
}

const tecnicos = {
  query,
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
      const rows = await query<ClienteWithLocation>(dataSql, params);
      
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
  servicios_prestados: {
    findMany: async (args?: ServiceFindManyArgs) => {
      const baseSql = `
        FROM servicios_prestados sp
        LEFT JOIN clientes c ON sp.Id_cliente = c.Id_cliente
        LEFT JOIN tipo_de_servicios s ON sp.id_servicio = s.id_servicio
        LEFT JOIN especializacion e ON sp.id_tipodeservicio = e.id_tiposervicio
        LEFT JOIN trabajadores pt ON sp.id_trabajador = pt.id_trabajador
        LEFT JOIN municipios m ON sp.id_municipio = m.id_municipio
        LEFT JOIN barrios b ON sp.id_barrio = b.id_barrio
        LEFT JOIN metodos_de_pago mp ON sp.id_metodo_depago = mp.id_metodo
        LEFT JOIN estatus es ON sp.id_status = es.id_status
      `;
      
      const params: QueryParam[] = [];
      const conditions: string[] = [];

      if (args?.where) {
        if (args.where.fecha_visita) {
            if (args.where.fecha_visita.gte) {
                conditions.push('sp.dia_visita >= ?');
                params.push(args.where.fecha_visita.gte);
            }
            if (args.where.fecha_visita.lte) {
                conditions.push('sp.dia_visita <= ?');
                params.push(args.where.fecha_visita.lte);
            }
        }
        
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

        if (args.where.id_cliente) {
          conditions.push('sp.Id_cliente = ?');
          params.push(args.where.id_cliente);
        }
        if (args.where.id_empresa) {
          conditions.push('sp.id_tipodeservicio = ?'); 
          params.push(args.where.id_empresa);
        }
        if (args.where.id_municipio) {
            conditions.push('sp.id_municipio = ?');
            params.push(args.where.id_municipio);
        }
        if (args.where.id_fumigador) {
            conditions.push('sp.id_trabajador = ?');
            params.push(args.where.id_fumigador);
        }
      }

      let whereClause = '';
      if (conditions.length > 0) {
        whereClause = ` WHERE ${conditions.join(' AND ')}`;
      }

      const countSql = `SELECT COUNT(*) as total ${baseSql} ${whereClause}`;
      
      let dataSql = `
        SELECT 
          sp.*,
          c.nombre as cliente_nombre, c.apellido as cliente_apellido,
          s.Servicio as servicio_nombre,
          e.nombre as empresa_nombre,
          pt.Nombre as tecnico_nombre, pt.Apellido as tecnico_apellido,
          m.Nombre as municipio_nombre,
          b.Nombre as barrio_nombre,
          mp.Nombre as metodo_pago_nombre,
          es.Nombre as estado_servicio_nombre
        ${baseSql} ${whereClause}
        ORDER BY sp.id_servicio_prestado DESC
      `;
      
      if (args?.take) {
        dataSql += ` LIMIT ${args.take}`;
        if (args?.skip) {
            dataSql += ` OFFSET ${args.skip}`;
        }
      }
      
      const countRows = await query<CountResult>(countSql, params);
      const rows = await query<ServicioRow>(dataSql, params);
      
      const total = Number(countRows[0]?.total || 0);

      const data = rows.map((row) => ({
        ...row,
        // Map fields to match common interface or expected structure
        id: row.id_servicio_prestado,
        fecha_visita: row.dia_visita, // Map schema field to UI expected field
        direccion_servicio: row.direccion, // Map schema field to UI expected field
        valor_pagado: null, 
        valor_cotizacion: row.total_cotizado !== null ? Number(row.total_cotizado) : null,
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
        perfil_trabajador: {
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
        estado_servicio: {
            estado_servicio: row.estado_servicio_nombre
        }
      }));

      return { data, total };
    },
    getFilterOptions: async (): Promise<FilterOptionsResult> => {
        // Mapping especializacion as "empresas" for filter consistency or just return empty
        const empresas = await query<{ id: number; nombre: string }>('SELECT id_tiposervicio as id, nombre FROM especializacion ORDER BY nombre');
        const municipios = await query<{ id_municipio: number; Nombre: string }>('SELECT DISTINCT id_municipio, Nombre FROM municipios ORDER BY Nombre');
        const tecnicos = await query<{ id: number; nombre: string; apellido: string }>('SELECT id_trabajador as id, Nombre as nombre, Apellido as apellido FROM trabajadores WHERE Nombre IS NOT NULL ORDER BY Nombre');
        
        return { empresas, municipios, tecnicos };
    }
  }
};

export default tecnicos;
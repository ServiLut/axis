import 'dotenv/config';
process.env.DATABASE_URL = process.env.POSTGRES_URL_NON_POOLING;
import prisma from '../lib/prisma';

async function run() {
  try {
    console.log('Using URL:', process.env.POSTGRES_URL_NON_POOLING?.split('@')[1]); // Log part of URL for safety
    console.log('Fetching tables from public schema...');
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log('Tables found:', tables.map(t => t.table_name));

    const productosCount = await prisma.productosFumigacion.count();
    console.log('Total ProductosFumigacion (via Prisma):', productosCount);

    const rawRows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT * FROM "ProductosFumigacion" LIMIT 10'
    );
    console.log('Raw rows from ProductosFumigacion:', JSON.stringify(rawRows, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));

    const solicitadosCount = await prisma.productosFumigacionSolicitados.count();
    console.log('Total ProductosFumigacionSolicitados (via Prisma):', solicitadosCount);

  } catch (error) {
    console.error('Error during debug:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();
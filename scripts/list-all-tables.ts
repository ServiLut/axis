import 'dotenv/config';
import prisma from '../lib/prisma';

async function run() {
  try {
    const schemas = await prisma.$queryRawUnsafe<{ schema_name: string }[]>(
      "SELECT schema_name FROM information_schema.schemata"
    );
    console.log('Schemas:', schemas.map(s => s.schema_name));

    for (const schema of schemas) {
      const sName = schema.schema_name;
      if (sName.startsWith('pg_') || sName === 'information_schema') continue;
      
      const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = '${sName}'`
      );
      console.log(`Tables in ${sName}:`, tables.map(t => t.table_name));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

run();

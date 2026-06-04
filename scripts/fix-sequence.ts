
import prisma from "../lib/prisma";

async function main() {
  try {
    // 1. Get the max ID from OrdenServicio
    const maxIdResult = await prisma.ordenServicio.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true }
    });

    const maxId = maxIdResult?.id || 0;
    console.log(`Max ID found: ${maxId}`);

    // 2. Reset the sequence
    const nextVal = maxId + 1;
    // Note: The sequence name is usually "OrdenServicio_id_seq" for PostgreSQL
    // We try to execute it. If the sequence name is different, this might fail, but it's the standard.
    await prisma.$executeRawUnsafe(`SELECT setval('public."OrdenServicio_id_seq"', ${nextVal}, false);`);
    
    console.log(`Sequence "OrdenServicio_id_seq" reset to ${nextVal}`);

  } catch (e) {
    console.error("Error fixing sequence:", e);
  } finally {
    // We should not disconnect the shared prisma instance used by the app, 
    // but since this is a script, it's fine.
    await prisma.$disconnect();
  }
}

main();


import prisma from '../lib/prisma';

async function main() {
  const servicios = await prisma.servicio.findMany({
    select: { id: true, nombre: true, tenantId: true }
  });
  console.log(JSON.stringify(servicios, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());

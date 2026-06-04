import prisma from '../lib/prisma.js';

async function main() {
  const servicio = await prisma.servicio.findUnique({
    where: { id: 79 }
  });
  console.log('Servicio 79:', servicio);

  const tipoServicio = await prisma.tipoServicio.findUnique({
    where: { id: 30 }
  });
  console.log('TipoServicio 30:', tipoServicio);
}

main().catch(console.error);
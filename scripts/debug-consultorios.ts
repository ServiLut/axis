import dotenv from 'dotenv';
dotenv.config();

import prisma from '../lib/prisma';

async function main() {
  try {
    const consultorios = await prisma.consultorios.findMany();
    console.log("Total consultorios:", consultorios.length);
    console.log(consultorios);
    
    const tenants = await prisma.tenant.findMany();
    console.log("Tenants:", tenants.map(t => ({ id: t.id, nombre: t.nombre })));

  } catch (error) {
    console.error("Error:", error);
  } finally {
    // prisma disconnect is handled by the lib usually, but we can try to force it or just let the script exit
  }
}

main();
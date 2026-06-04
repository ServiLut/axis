
import prisma from "../lib/prisma";

async function main() {
  console.log("Checking Users...");
  const users = await prisma.usuario.findMany({
    select: {
      id: true,
      username: true,
      tenantId: true,
      rol: true
    }
  });
  console.table(users);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

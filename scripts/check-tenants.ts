
import prisma from "../lib/prisma";

async function main() {
  console.log("Checking Tenants...");
  const tenants = await prisma.tenant.findMany();
  console.table(tenants);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

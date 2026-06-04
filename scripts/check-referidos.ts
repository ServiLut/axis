
import prisma from "../lib/prisma";

async function main() {
  console.log("Checking Referidos data...");
  const referidos = await prisma.referidos.findMany({
    include: {
      Usuario: {
        select: {
          id: true,
          tenantId: true,
          username: true
        }
      }
    }
  });
  
  console.log(`Found ${referidos.length} records.`);
  console.log(JSON.stringify(referidos, (key, value) =>
    typeof value === 'bigint'
        ? value.toString()
        : value // return everything else unchanged
, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import prisma from "../lib/prisma";

async function main() {
  console.log("Starting audit log test...");

  try {
    // 1. Get a valid user and tenant to use for the test
    const user = await prisma.usuario.findFirst();
    if (!user) {
      console.error("No users found in the database. Cannot test audit log.");
      return;
    }

    console.log(`Using user: ${user.username} (ID: ${user.id}, Tenant: ${user.tenantId})`);

    // 2. Attempt to create an audit log entry manually
    const log = await prisma.auditoria.create({
      data: {
        tenantId: user.tenantId,
        usuarioId: user.id,
        accion: "TEST_CREATE",
        entidad: "TestEntity",
        entidadId: "123",
        detalles: {
          descripcion: "Test log from diagnostic script",
          timestamp: new Date().toISOString(),
        },
      },
    });

    console.log("Successfully created audit log:", log);

    // 3. Verify it exists
    const fetchedLog = await prisma.auditoria.findUnique({
      where: { id: log.id },
    });

    if (fetchedLog) {
      console.log("Successfully fetched audit log from DB:", fetchedLog);
    } else {
      console.error("Failed to fetch the created audit log immediately after creation.");
    }

  } catch (error) {
    console.error("Error during audit log test:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

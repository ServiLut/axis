import assert from "node:assert/strict";
import { test } from "node:test";
import { loadServerModule } from "../../../../tests/load-server-module";
import type * as Users from "./actions";

function userForm(document = "") {
  const form = new FormData();
  for (const [key, value] of Object.entries({ username: "nueva.psicologa", email: "nueva@example.test", password: "clave-prueba", nombre: "Ana", apellido: "Pérez", rol: "TECNICO", numeroDocumento: document, activo: "on" })) form.set(key, value);
  return form;
}

function fixture(duplicate: "username" | "document" | null = null) {
  let writes = 0;
  const actions = loadServerModule<typeof Users>("app/(protected)/dashboard/usuarios/actions.ts", {
    "@/lib/auth": { verifyToken: () => ({ userId: 10, role: "ADMIN", tenantId: 4 }) },
    "@/lib/prisma": {
      empresa: { findMany: async () => [{ id: 3, nombre: "PSICOLOGOS" }] },
      usuario: {
        findUnique: async () => ({ tenantId: 4 }),
        findFirst: async ({ where }: { where: { tenantId: number; OR: Record<string, string>[] } }) => {
          assert.equal(where.tenantId, 4);
          assert.ok(where.OR.every((criterion) => Object.values(criterion).every((value) => typeof value === "string" && value.trim().length > 0)), "Optional blank values must not become duplicate search criteria");
          if (duplicate === "username") return { username: "nueva.psicologa", email: "otro@example.test", numeroDocumento: null };
          if (duplicate === "document") {
            assert.ok(where.OR.some((criterion) => criterion.numeroDocumento === "AB123"));
            return { username: "otra.psicologa", email: "otro@example.test", numeroDocumento: "AB123" };
          }
          assert.ok(where.OR.every((criterion) => !("numeroDocumento" in criterion)));
          return null;
        },
        create: async ({ data }: { data: { numeroDocumento: string | null } }) => {
          writes++;
          assert.equal(data.numeroDocumento, null);
          return { id: 20 };
        },
      },
    },
    bcrypt: { hash: async () => "hash-de-prueba" },
    "@/lib/audit": { createAuditLog: async () => {} },
    "next/cache": { revalidatePath() {} },
  });
  return { actions, writes: () => writes };
}

test("a team member can be created with the optional document blank", async () => {
  for (const document of ["", "   "]) {
    const setup = fixture();
    assert.equal((await setup.actions.createUsuario("valid", userForm(document))).success, true);
    assert.equal(setup.writes(), 1);
  }
});

test("a duplicate username is reported before writing when the optional document is blank", async () => {
  const setup = fixture("username");
  assert.equal((await setup.actions.createUsuario("valid", userForm())).error, "El nombre de usuario ya existe");
  assert.equal(setup.writes(), 0);
});

test("a supplied alphanumeric document still prevents duplicate team identities", async () => {
  const setup = fixture("document");
  assert.equal((await setup.actions.createUsuario("valid", userForm(" AB123 "))).error, "El número de documento ya existe");
  assert.equal(setup.writes(), 0);
});

import { PrismaClient } from "../prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const prismaClientSingleton = () => {
  const rawConnectionString =
    process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || "";

  let connectionString = rawConnectionString;

  try {
      const url = new URL(rawConnectionString);
      url.searchParams.delete('sslmode');
      connectionString = url.toString();
  } catch {
      console.warn("Invalid connection string format, using raw string.");
  }

  const sslConfig = process.env.DB_CA_CERT
    ? {
        rejectUnauthorized: true,
        ca: process.env.DB_CA_CERT,
      }
    : process.env.DB_SSL === "true"
    ? {
        rejectUnauthorized: false,
      }
    : false;

  const pool = new pg.Pool({
    connectionString,
    ssl: sslConfig,
    max: 10,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
};

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== "production") globalThis.prisma = prisma;
import { PrismaClient } from "../prisma/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const prismaClientSingleton = () => {
  // Fix for self-signed certificates (applied globally to resolve Vercel/Supabase issues)
  // process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

  // Prioritize the transaction pooler (POSTGRES_PRISMA_URL) for serverless
  const rawConnectionString =
    process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || "";

  let connectionString = rawConnectionString;

  try {
      // Safely parse and clean the connection string using URL API
      const url = new URL(rawConnectionString);
      // Remove sslmode to avoid conflicts with manual ssl config in pg.Pool
      url.searchParams.delete('sslmode');
      connectionString = url.toString();
  } catch {
      // Fallback: if URL parsing fails (e.g. empty string), keep original
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
    max: 1, // Limit pool size for serverless
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 2000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });
};

// We do NOT use globalThis here to avoid picking up the stale global instance
// This ensures we get a fresh instance with the new schema
const prisma = prismaClientSingleton();

export default prisma;

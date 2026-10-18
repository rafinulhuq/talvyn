/**
 * Prisma Client singleton.
 *
 * In development, Next.js hot-reload creates multiple module instances,
 * which would exhaust the PostgreSQL connection pool.
 * This pattern caches the client on the global object in development.
 *
 * Usage:
 *   import { prisma } from "@/lib/prisma";
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

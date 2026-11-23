import { PrismaClient } from "@prisma/client";

// One client per process. Dev hot-reload re-evaluates modules, which would
// open a new connection pool each time and exhaust Postgres — cache it on
// globalThis outside production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

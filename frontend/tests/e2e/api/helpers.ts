import type { APIRequestContext } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma } from "../../../src/server/prisma";

export { prisma };
export const PASSWORD = "correct-horse-battery";

const rand = () => Math.random().toString(36).slice(2, 10);
/** Distinct synthetic IP per call so tests don't share the real per-IP limiters. */
export const testIp = () => `192.0.${1 + Math.floor(Math.random() * 254)}.${1 + Math.floor(Math.random() * 254)}`;

type Role = "USER" | "ADMIN" | "SUPER_ADMIN" | "DEV";

export async function createUser(opts: { role?: Role; signupStatus?: "APPROVED" | "PENDING" | "REJECTED"; isActive?: boolean; deleted?: boolean } = {}) {
  return prisma.user.create({
    data: {
      name: "E2E Person",
      email: `e2e-${rand()}@example.com`,
      passwordHash: await bcrypt.hash(PASSWORD, 4), // low cost: speed; compare works at any cost
      role: opts.role ?? "ADMIN",
      signupStatus: opts.signupStatus ?? "APPROVED",
      isActive: opts.isActive ?? true,
      deletedAt: opts.deleted ? new Date() : null,
    },
  });
}

export const cleanup = (...ids: string[]) => prisma.user.deleteMany({ where: { id: { in: ids } } });

/** Sign in through NextAuth's credentials endpoint; the request context keeps the cookie. */
export async function signIn(request: APIRequestContext, email: string, password = PASSWORD): Promise<boolean> {
  const { csrfToken } = (await (await request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  await request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password, json: "true" },
    maxRedirects: 0,
  });
  const session = (await (await request.get("/api/auth/session")).json()) as { user?: { email?: string } };
  return session?.user?.email === email.trim().toLowerCase();
}

/** Same-origin JSON headers, as the real app sends them. */
export const json = { "content-type": "application/json", "sec-fetch-site": "same-origin" };

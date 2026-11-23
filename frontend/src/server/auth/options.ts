import bcrypt from "bcryptjs";
import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { normalizeEmail } from "@/lib/auth/password-policy";
import { prisma } from "@/server/prisma";
import { loginLimiter } from "@/server/rate-limit";
import { currentSessionUser } from "./session";

// A real bcrypt hash of a throwaway string (not a credential). Comparing against
// it when there is no user keeps "unknown email" as slow as "wrong password" —
// bcryptjs short-circuits on malformed hashes, which would leak via timing.
const DUMMY_HASH = "$2a$10$xfg9dZ8RTrA3YAXnT7fAEeih4P3fDZt1uwhANX44QfxA3W6S9xPwq";

const loginSchema = z.object({
  email: z.email().transform(normalizeEmail),
  password: z.string().min(8),
});

function originOf(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function canonicalAppOrigin(baseUrl: string): string {
  return (
    originOf(process.env.NEXT_PUBLIC_APP_URL) ??
    originOf(process.env.PUBLIC_APP_URL) ??
    originOf(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    originOf(process.env.NEXTAUTH_URL) ??
    baseUrl
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials): Promise<User | null> {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        // Normalized BEFORE the lockout check. The previous version keyed the
        // lockout on the raw email, so changing letter case reset the counter.
        const { email, password } = parsed.data;

        if (loginLimiter.isLimited(email)) {
          await bcrypt.compare(password, DUMMY_HASH); // same timing as a normal failure
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true, email: true, name: true, passwordHash: true, role: true,
            isActive: true, signupStatus: true, sessionVersion: true, deletedAt: true,
          },
        });

        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !valid) {
          loginLimiter.hit(email);
          return null;
        }

        // Inactive, removed, or not-yet-approved accounts fail exactly like a
        // wrong password, so the form never confirms an account exists.
        if (!user.isActive || user.deletedAt || user.signupStatus !== "APPROVED") return null;

        loginLimiter.reset(email);
        return { id: user.id, email: user.email, name: user.name, role: user.role, sessionVersion: user.sessionVersion };
      },
    }),
  ],

  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },

  callbacks: {
    // Only ever redirect to our own origins (open-redirect guard).
    async redirect({ url, baseUrl }) {
      const app = canonicalAppOrigin(baseUrl);
      if (url.startsWith("/") && !url.startsWith("//")) return `${app}${url}`;
      const target = originOf(url);
      return target && (target === originOf(baseUrl) || target === originOf(app)) ? url : app;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
        return token;
      }
      const current = await currentSessionUser(token);
      if (!current) {
        // Poison the token: every later check fails without another DB hit.
        token.invalidated = true;
        token.id = "";
        token.sub = "";
        token.role = "";
      } else {
        token.role = current.role; // role changes apply without re-login
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },

  pages: { signIn: "/login", error: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};

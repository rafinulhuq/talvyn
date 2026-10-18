/**
 * NextAuth configuration.
 *
 * Uses Credentials provider (email + password) backed by
 * the PostgreSQL database via Prisma.
 *
 * Import authOptions wherever you need the session:
 *   - Server components: getServerSession(authOptions)
 *   - API routes: getServerSession(authOptions)
 */

import { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { currentSessionUser } from "@/lib/auth/sessionState";
import { clearAttempts, isLockedOut, recordFailedAttempt } from "@/lib/auth/loginRateLimit";

const DUMMY_HASH = "$2a$10$xfg9dZ8RTrA3YAXnT7fAEeih4P3fDZt1uwhANX44QfxA3W6S9xPwq";

const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function originOf(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

function canonicalAuthBaseUrl(baseUrl: string): string {
  return (
    originOf(process.env.NEXT_PUBLIC_APP_URL) ??
    originOf(process.env.PUBLIC_APP_URL) ??
    originOf(process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    originOf(process.env.NEXTAUTH_URL) ??
    baseUrl
  );
}

export const authOptions: NextAuthOptions = {
  // ─── Providers ──────────────────────────────────────────────
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials): Promise<User | null> {
        // Validate input shape first
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        if (isLockedOut(email)) {
          // Still spend the bcrypt cost so a locked-out response isn't
          // distinguishable by timing from a normal failed attempt.
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        // Fetch user from database
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            isActive: true,
            signupStatus: true,
            sessionVersion: true,
            deletedAt: true,
          },
        });

        if (!user) {
          // Constant-time: still run a real bcrypt comparison so "no such
          // user" takes the same ~cost-10 time as "wrong password" below.
          // The previous placeholder ("...constanttime") wasn't a
          // structurally valid bcrypt hash, so bcryptjs short-circuited
          // before doing the actual Blowfish work — it measured at 0ms vs
          // ~60ms for a real compare, which is exactly the timing
          // side-channel this code is supposed to prevent. This is a real
          // hash of an arbitrary placeholder string, not a credential.
          await bcrypt.compare(password, DUMMY_HASH);
          recordFailedAttempt(email);
          return null;
        }

        const passwordValid = await bcrypt.compare(password, user.passwordHash);
        if (!passwordValid) {
          recordFailedAttempt(email);
          return null;
        }

        // Deactivated accounts fail sign-in the same generic way as a wrong
        // password — not a distinct error, so a deactivated admin can't use
        // the login form's error message to confirm their account still
        // exists.
        if (!user.isActive) {
          return null;
        }

        // Removed (soft-deleted) accounts fail sign-in the same generic way.
        // Independent of isActive — a restored account only regains access
        // once deletedAt is cleared, regardless of whatever isActive was
        // left at.
        if (user.deletedAt) {
          return null;
        }

        // A signup request that hasn't been approved by a Super Admin yet
        // (or was rejected) fails sign-in the same generic way as a wrong
        // password — no signal distinguishing "pending approval" from
        // "wrong password" is given to an unapproved applicant.
        if (user.signupStatus !== "APPROVED") {
          return null;
        }

        clearAttempts(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // Custom fields surfaced on the session
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],

  // ─── Session ────────────────────────────────────────────────
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
  },

  // ─── JWT callbacks ──────────────────────────────────────────
  callbacks: {
    async redirect({ url, baseUrl }) {
      const appBaseUrl = canonicalAuthBaseUrl(baseUrl);
      const allowedOrigins = new Set(
        [originOf(baseUrl), originOf(appBaseUrl)].filter(Boolean)
      );

      if (url.startsWith("/") && !url.startsWith("//")) {
        return `${appBaseUrl}${url}`;
      }

      const targetOrigin = originOf(url);
      if (targetOrigin && allowedOrigins.has(targetOrigin)) {
        return url;
      }

      return appBaseUrl;
    },
    async jwt({ token, user }) {
      // On sign-in, persist custom fields to the JWT
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
      } else {
        const current = await currentSessionUser(token);
        if (!current) {
          token.invalidated = true;
          token.id = "";
          token.sub = "";
          token.role = "";
        } else {
          token.role = current.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Surface JWT data on the session object
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },

  // ─── Pages ──────────────────────────────────────────────────
  pages: {
    signIn: "/login",
    error: "/login",
  },

  // ─── Security ───────────────────────────────────────────────
  secret: process.env.NEXTAUTH_SECRET,

  // ─── Debug (development only) ───────────────────────────────
  debug: process.env.NODE_ENV === "development",
};

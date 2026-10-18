import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma, Role, SignupStatus } from "@prisma/client";
import { isSignupRateLimited, recordSignupAttempt } from "@/lib/auth/signupRateLimit";
import { getForwardedClientIp } from "@/lib/server/clientIp";
import { normalizeE164 } from "@/lib/phone";
import { notifySuperAdminsOfSignupRequest } from "@/lib/signupNotifications";

/** Only http(s) with a real hostname (must contain a dot) — blocks javascript:/data: XSS vectors. */
const companyWebsiteSchema = z
  .string()
  .max(2048, "Company website URL is too long")
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (!url.hostname.includes(".")) return false;
    return true;
  }, "Enter a valid company website URL");

const signupSchema = z.object({
  companyName: z.string().min(1, "Company name is required").max(255).trim(),
  name: z.string().min(1, "Name is required").max(255).trim(),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Username can only contain letters, numbers, dots, underscores, and hyphens")
    .toLowerCase(),
  roleInCompany: z.string().trim().min(1, "Role in company is required").max(255),
  companyWebsite: companyWebsiteSchema,
  phoneNumber: z.string().transform((value, ctx) => {
    const normalized = normalizeE164(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number" });
      return z.NEVER;
    }
    return normalized;
  }),
  email: z.string().min(1, "Email is required").email("Enter a valid email address").toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(req: NextRequest) {
  const ip = getForwardedClientIp(req) ?? "unknown";
  if (isSignupRateLimited(ip)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Too many signup attempts. Please try again later." } },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "Invalid input.",
        },
      },
      { status: 400 }
    );
  }

  recordSignupAttempt(ip);

  const { companyName, name, username, roleInCompany, companyWebsite, phoneNumber, email, password } = parsed.data;

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) {
    return NextResponse.json(
      { error: { code: "EMAIL_TAKEN", message: "An account with this email already exists." } },
      { status: 409 }
    );
  }

  const existingUsername = await prisma.user.findUnique({ where: { username } });
  if (existingUsername) {
    return NextResponse.json(
      { error: { code: "USERNAME_TAKEN", message: "This username is already taken." } },
      { status: 409 }
    );
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        companyName,
        username,
        roleInCompany,
        companyWebsite,
        phoneNumber,
        // New self-signups default to USER (a hiring operator). A Super Admin
        // approves the request and can later promote to ADMIN. See
        // docs/superpowers/plans/2026-08-05-user-role-plan.md.
        role: Role.USER,
        signupStatus: SignupStatus.PENDING,
      },
    });

    // Best-effort — a Super Admin can still review pending requests in the
    // UI even if this notification fails, so it must never block signup.
    notifySuperAdminsOfSignupRequest({ requesterName: name, requesterEmail: email, companyName }).catch((err) => {
      console.error("[signup POST] failed to notify Super Admins:", err);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? target : typeof target === "string" ? [target] : [];
      if (fields.some((f) => String(f).includes("username"))) {
        return NextResponse.json(
          { error: { code: "USERNAME_TAKEN", message: "This username is already taken." } },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: { code: "EMAIL_TAKEN", message: "An account with this email already exists." } },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

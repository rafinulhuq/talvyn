import bcrypt from "bcryptjs";
import { Prisma, Role, SignupStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { newPasswordSchema, normalizeEmail } from "@/lib/auth/password-policy";
import { normalizeE164 } from "@/lib/phone";
import { getClientIp } from "@/server/client-ip";
import { notifySuperAdminsOfSignupRequest } from "@/server/notifications";
import { prisma } from "@/server/prisma";
import { signupLimiter } from "@/server/rate-limit";
import { readJson } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

/** http(s) only, with a dotted hostname — blocks javascript:/data: URLs that would later render as links. */
const websiteSchema = z
  .string()
  .max(2048, "That URL is too long.")
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
    } catch {
      return false;
    }
  }, "Enter your company website, like https://example.com.");

const schema = z.object({
  companyName: z.string().trim().min(1, "Enter your company name.").max(255),
  name: z.string().trim().min(1, "Enter your name.").max(255),
  username: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters for your username.")
    .max(32, "Use at most 32 characters for your username.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Usernames can use letters, numbers, dots, underscores and hyphens.")
    .toLowerCase(),
  roleInCompany: z.string().trim().min(1, "Enter your role.").max(255),
  companyWebsite: websiteSchema,
  phoneNumber: z.string().transform((value, ctx) => {
    const normalized = normalizeE164(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number." });
      return z.NEVER;
    }
    return normalized;
  }),
  email: z.email("Enter a valid email address.").transform(normalizeEmail),
  password: newPasswordSchema,
});

const taken = (field: "email" | "username") =>
  field === "username"
    ? errorJson(409, "USERNAME_TAKEN", "This username is taken. Try another.")
    : errorJson(409, "EMAIL_TAKEN", "An account with this email already exists.");

/** Public access request. Creates a PENDING USER that a Super Admin must approve before sign-in works. */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req) ?? "unknown";
  if (signupLimiter.isLimited(ip)) return errorJson(429, "RATE_LIMITED", "Too many signup attempts. Try again later.");

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form and try again.");
  signupLimiter.hit(ip); // only well-formed attempts count

  const { password, ...data } = parsed.data;
  if (await prisma.user.findUnique({ where: { email: data.email } })) return taken("email");
  if (await prisma.user.findUnique({ where: { username: data.username } })) return taken("username");

  try {
    await prisma.user.create({
      data: { ...data, passwordHash: await bcrypt.hash(password, 12), role: Role.USER, signupStatus: SignupStatus.PENDING },
    });
  } catch (err) {
    // Unique violation from a concurrent signup between the checks above and the insert.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const fields = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
      return taken(fields.some((f) => f.includes("username")) ? "username" : "email");
    }
    throw err;
  }

  // Best effort: pending requests are visible in the Users screen regardless.
  notifySuperAdminsOfSignupRequest({ requesterName: data.name, requesterEmail: data.email, companyName: data.companyName }).catch(
    (err: Error) => console.error(`[signup] notify failed: ${err.message}`),
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}

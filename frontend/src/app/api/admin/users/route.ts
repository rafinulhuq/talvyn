import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { newPasswordSchema, normalizeEmail } from "@/lib/auth/password-policy";
import { requireUser } from "@/server/auth/require-user";
import { prisma } from "@/server/prisma";
import { readJson, rejectUnsafeMutation } from "@/server/request-guards";
import { errorJson } from "@/server/upstream";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(255, "Name is too long."),
  email: z.email("Enter a valid email address.").transform(normalizeEmail),
  password: newPasswordSchema,
  role: z.enum(Role),
});

/** Super Admin creates an account directly (pre-approved, no signup request). */
export async function POST(req: NextRequest) {
  const unsafe = rejectUnsafeMutation(req);
  if (unsafe) return unsafe;
  const auth = await requireUser(req, "SUPER_ADMIN");
  if (auth.response) return auth.response;

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return errorJson(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const { name, email, password, role } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    return errorJson(409, "EMAIL_TAKEN", "An account with this email already exists.");
  }
  const user = await prisma.user.create({
    data: { name, email, role, passwordHash: await bcrypt.hash(password, 12) },
    select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
  });
  return NextResponse.json({ user }, { status: 201 });
}

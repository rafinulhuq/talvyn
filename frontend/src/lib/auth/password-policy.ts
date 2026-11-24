import { z } from "@/lib/zod";

// 72 bytes is bcrypt's input limit; longer passwords would be silently truncated.
export const newPasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "Use at most 72 bytes (about 72 Latin characters).");

export const passwordConfirmationSchema = z
  .object({ password: newPasswordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords don't match.", path: ["confirmPassword"] });

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

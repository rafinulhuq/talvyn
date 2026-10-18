import { z } from "zod";

export const newPasswordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 bytes")
  .refine((value) => new TextEncoder().encode(value).length <= 72,
    "Password must be at most 72 bytes");

export const passwordConfirmationSchema = z.object({
  password: newPasswordSchema,
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});

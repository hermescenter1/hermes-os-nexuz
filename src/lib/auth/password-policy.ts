/**
 * Password policy & strength validation (Phase 28).
 * Used server-side for API validation and client-side for live feedback.
 */

import { z } from "zod";

export interface PasswordStrength {
  score:    0 | 1 | 2 | 3 | 4; // 0 = very weak, 4 = strong
  label:    "very-weak" | "weak" | "fair" | "strong" | "very-strong";
  feedback: string[];
}

/** Strong password policy — minimum 8 chars with complexity. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must not exceed 128 characters")
  .refine((p) => /[A-Z]/.test(p), "Must include at least one uppercase letter")
  .refine((p) => /[a-z]/.test(p), "Must include at least one lowercase letter")
  .refine((p) => /[0-9]/.test(p), "Must include at least one number")
  .refine(
    (p) => /[^A-Za-z0-9]/.test(p),
    "Must include at least one special character"
  );

/** Registration schema with password confirmation. */
export const registerSchema = z
  .object({
    name:            z.string().min(2, "Name must be at least 2 characters").max(100),
    email:           z.string().email("Invalid email address"),
    password:        passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/** Login schema. */
export const loginSchema = z.object({
  email:      z.string().email("Invalid email address"),
  password:   z.string().min(1, "Password is required"),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Forgot-password schema. */
export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/** Reset-password schema. */
export const resetPasswordSchema = z
  .object({
    token:           z.string().min(1, "Reset token is required"),
    password:        passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** Real-time password strength scorer (client + server). */
export function scorePassword(password: string): PasswordStrength {
  let score = 0;
  const feedback: string[] = [];

  if (password.length >= 8)  score++;
  else feedback.push("At least 8 characters");

  if (password.length >= 12) score++;
  else feedback.push("12+ characters recommended");

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  else feedback.push("Mix upper and lowercase");

  if (/[0-9]/.test(password)) score++;
  else feedback.push("Add a number");

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push("Add a special character");

  const capped = Math.min(4, score) as PasswordStrength["score"];
  const labels: PasswordStrength["label"][] = [
    "very-weak", "weak", "fair", "strong", "very-strong",
  ];

  return { score: capped, label: labels[capped], feedback };
}

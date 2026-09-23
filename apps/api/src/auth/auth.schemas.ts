import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
    email: z.string().trim().email().max(254),
    officeDesignation: z.string().trim().max(150).optional(),
    requestedRoleKey: z.string().trim().min(1).max(100),
    password: passwordSchema,
    confirmPassword: z.string(),
    termsAccepted: z.literal(true),
    termsVersion: z.string().trim().min(1).max(50),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const reviewRegistrationSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const impersonateSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
});

export const adminResetPasswordSchema = z.object({
  userId: z.string().uuid(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

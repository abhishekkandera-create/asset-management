import { z } from 'zod';
import { UserRole } from '../enums/user';
import { isoDateTimeSchema, uuidSchema } from './common';

/** `z.nativeEnum` over our `as const` objects infers the exact string union. */
export const userRoleSchema = z.nativeEnum(UserRole);

export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const authUserSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  fullName: z.string(),
  role: userRoleSchema,
  isActive: z.boolean(),
  lastLoginAt: isoDateTimeSchema.nullable(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access token lifetime in seconds, so the client can schedule a refresh. */
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const loginResponseSchema = authTokensSchema.extend({ user: authUserSchema });
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Claims carried by the access token. */
export const accessTokenPayloadSchema = z.object({
  sub: uuidSchema,
  email: z.string().email(),
  role: userRoleSchema,
});
export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

export const refreshTokenPayloadSchema = z.object({
  sub: uuidSchema,
  /** Id of the refresh_token row, so rotation can revoke exactly this one. */
  jti: uuidSchema,
});
export type RefreshTokenPayload = z.infer<typeof refreshTokenPayloadSchema>;

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(10, 'Password must be at least 10 characters')
      .max(128)
      .regex(/[a-z]/, 'Must contain a lowercase letter')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/\d/, 'Must contain a digit'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'New password must differ from the current one',
    path: ['newPassword'],
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

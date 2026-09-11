import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at startup.
 * A missing or malformed variable aborts the boot with a readable report
 * rather than surfacing as an undefined at 3am (CLAUDE.md §11).
 */
const booleanFromString = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /**
   * Managed hosts (Render, Railway, Heroku) inject the port they expect the
   * process to bind to as PORT, and route traffic nowhere else. When present
   * it overrides API_PORT — see the transform at the bottom of this schema.
   */
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) =>
      v
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  DATABASE_URL: z.string().url(),

  // Redis backs the scheduled jobs in phase 7; nothing connects to it yet.
  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),

  // Object storage is only read once invoice uploads land (phase 4). These stay
  // optional so the API boots on a host that has no bucket yet; the storage
  // service asserts they are present at the point it actually needs them.
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1).optional(),
  S3_SECRET_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: booleanFromString.default(false),
});

export const resolvedEnvSchema = envSchema.transform((env) => ({
  ...env,
  API_PORT: env.PORT ?? env.API_PORT,
}));

export type Env = z.infer<typeof resolvedEnvSchema>;

/** Thrown before Nest is even constructed, so it must print its own report. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = resolvedEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const report = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration. Fix the following and restart:\n${report}\n\n` +
        `See .env.example for the full list of variables.`,
    );
  }
  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    throw new Error(
      'Invalid environment configuration:\n  - JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
    );
  }
  return parsed.data;
}

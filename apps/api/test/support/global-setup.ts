import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Applies migrations to the test database once per run. `migrate deploy` is
 * used rather than `db push` so the suite exercises the same SQL production
 * gets — including the partial unique index and the append-only triggers,
 * which a schema push would not create.
 */
export default function setup(): void {
  config({ path: resolve(__dirname, '../../../../.env') });

  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('TEST_DATABASE_URL is not set; cannot prepare the test database');
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

/**
 * Points every integration test at the throwaway `asset_management_test`
 * database from docker-compose. Loaded before any module that reads env.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../../.env') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Copy .env.example to .env and run `docker compose up -d`.',
  );
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.LOG_LEVEL = 'error';
process.env.LOG_PRETTY = 'false';
// Deterministic secrets, so a failing test is never a secrets problem.
process.env.JWT_ACCESS_SECRET = 'test_access_secret_that_is_long_enough_123456';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_that_is_long_enough_654321';

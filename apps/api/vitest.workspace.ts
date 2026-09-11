import { defineWorkspace } from 'vitest/config';

/**
 * Two suites with different needs:
 *  - `unit` is pure and fast, and runs in CI on every push.
 *  - `integration` talks to the real Postgres test container from
 *    docker-compose, one file at a time so tests never race on the same rows.
 */
export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['test/unit/**/*.spec.ts', 'src/**/*.spec.ts'],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['test/integration/**/*.spec.ts'],
      globalSetup: ['./test/support/global-setup.ts'],
      setupFiles: ['./test/support/setup-env.ts'],
      // One process, one file at a time. Every integration file truncates the
      // shared test database between tests, so two running at once would each
      // wipe the other's fixtures mid-request.
      //
      // `fileParallelism` is not a project-level option in Vitest 2 — it is
      // passed as `--no-file-parallelism` by the test scripts in package.json.
      // singleFork is what actually keeps them in one process.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      maxConcurrency: 1,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  },
]);

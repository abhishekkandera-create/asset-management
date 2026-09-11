# IT Asset Management

Internal system for tracking physical hardware issued to employees — laptops,
monitors, chargers, docks, headsets. It answers, for any moment past or
present: who holds this asset, what does this person hold, and what has
happened to it since we bought it.

Users are the IT / admin team only. Employees are records in the system, not
users of it.

## Quick start

Requires Node 24 LTS, pnpm 9 and Docker.

```bash
nvm use                 # reads .nvmrc (24.21.0)
cp .env.example .env    # defaults work as-is for local development
docker compose up -d    # Postgres, Redis, MinIO (bucket created automatically)
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Then open http://localhost:5173 and sign in.

| Account                   | Password      | Role         |
| ------------------------- | ------------- | ------------ |
| `admin@example.com`       | `Admin@12345` | ADMIN        |
| `storekeeper@example.com` | `Admin@12345` | STORE_KEEPER |
| `viewer@example.com`      | `Admin@12345` | VIEWER       |

| Service       | URL                                                 |
| ------------- | --------------------------------------------------- |
| Web           | http://localhost:5173                               |
| API           | http://localhost:3000/api/v1                        |
| Swagger       | http://localhost:3000/api/docs                      |
| MinIO console | http://localhost:9011 (`minioadmin` / `minioadmin`) |

### Ports

This project uses an unusual port block (5442, 5443, 6389, 9010, 9011) to stay
clear of the defaults, which are commonly taken by other local stacks. Change
them in `.env` if they clash; `docker-compose.yml` reads the same values.

> **A note on the Node version.** CLAUDE.md §3 specifies Node 20 LTS, which was
> correct when it was written. Node 20 reached end of life in April 2026, and
> Vercel now refuses to build on it from 1 October 2026. The project therefore
> runs on Node 24 LTS. Nothing else about §3 changed, and the full suite passes
> unchanged on 24.

## Layout

```
apps/api        NestJS + Prisma + PostgreSQL
apps/web        React 18 + Vite + Tailwind + shadcn/ui
packages/shared Zod schemas, enums and the state-machine table — the contract
                between the two, imported by both
```

`@asset/shared` is the single source of truth for request/response shapes. The
API builds it to CommonJS; Vite compiles its TypeScript source directly, so
there is no build-order coupling between the packages.

## The rules this code is built around

These are structural. Breaking one is a bug even if the tests pass.

**The current holder is never stored.** There is no `current_employee_id` on
`asset`. The holder is the employee on the single `OPEN` row in `assignment`.
Overwriting a holder field would destroy history the moment an asset came back,
and preserving that history is what the system is for.

**One open assignment per asset, enforced by Postgres.** A partial unique index
(`assignment_one_open_per_asset`) makes the second of two concurrent issues fail
at the database. Two requests can both pass an application-level `SELECT`
check; only one can win an `INSERT`. The violation is translated to a 409.

**`asset_event` is append-only.** Every status, holder or location change writes
an event in the same transaction as the change. `BEFORE UPDATE` and
`BEFORE DELETE` triggers refuse to let a stray query edit history. Corrections
are new events, never edits.

**Employees and assets are archived, never deleted.** Exiting sets
`status = 'EXITED'` and `date_exited`. Every historical assignment keeps
pointing at a real row. There is no delete endpoint, and there will not be one.

**One writer for `asset.status`.** `AssetStateMachine` validates every
transition against a frozen allow-list and applies it with a status-guarded
`UPDATE`. No controller, repository or other service writes that column.

**Money is integer paise; timestamps are `timestamptz` in UTC.** Formatting to
rupees and to `Asia/Kolkata` happens only at the presentation layer.

## Commands

```bash
pnpm dev                 # API and web, in parallel
pnpm build               # build every package
pnpm typecheck           # source and tests
pnpm lint
pnpm test                # unit tests
pnpm --filter @asset/api test:integration   # needs docker compose up
pnpm --filter @asset/api test:all

pnpm db:migrate          # create and apply a migration
pnpm db:migrate:deploy   # apply pending migrations (CI / production)
pnpm db:reset            # drop, re-migrate and re-seed
pnpm db:studio

pnpm infra:up / infra:down / infra:reset
```

### Migrations

Checked-in migrations are never edited after being applied — fix forward with a
new one.

Two constructs in the initial migration cannot be expressed in Prisma schema
language and were written by hand: the partial unique index above, and the
`asset_event` append-only triggers, plus several `CHECK` constraints. Because
Prisma cannot see them, **review every generated migration before applying it**
— `prisma migrate dev` may propose dropping what it does not recognise.

### Tests

Unit tests run against nothing. Integration tests run against the real
`asset_management_test` Postgres container from `docker-compose.yml`, migrated
with `migrate deploy` so they exercise the same SQL production gets — including
the index and triggers a schema push would not create.

They share one database and truncate between tests, so they run in a single
process (`--no-file-parallelism` plus `poolOptions.forks.singleFork`).

## Seed data

`pnpm db:seed` builds the fixture used for manual testing: 3 locations, 4
vendors, 6 categories (2 bulk), 15 models, 60 employees (5 already exited), 200
assets across every status, 120 assignments including ten assets with three or
more successive holders, and events covering all twelve event types. It is
deterministic — the same run produces the same data on every machine.

## Build status

| Phase | Scope                                                                                                                   | State       |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1     | Monorepo, Docker, schema, migrations, seed, auth, health, error envelope, logging                                       | Done        |
| 2     | State machine, issue/return/inspect/transfer/mark-lost, asset list and detail, event timeline, employee list and detail | Done        |
| 3     | Clearance endpoint and screen, write-off flow, employee exit blocking rule                                              | Done        |
| 4     | Purchases, line items, receive-into-inventory, invoice upload                                                           | Not started |
| 5     | Bulk stock balances, ledger, reorder alerts, reconciliation                                                             | Not started |
| 6     | Repair tickets, warranty detection, cost tracking                                                                       | Not started |
| 7     | Reports, exports, barcode labels, dashboard charts, background jobs                                                     | Not started |
| 8     | Dockerfiles, CI, deployment                                                                                             | Not started |

Navigation entries for screens that arrive in a later phase are shown greyed
out rather than hidden, so the shape of the finished system stays visible.

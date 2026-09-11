import {
  INestApplication,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Transaction-aware Prisma client.
 *
 * Services that write to more than one table take a `tx` parameter typed as
 * `PrismaTransaction` so the same method works inside and outside a
 * `$transaction` block (CLAUDE.md §8).
 */
export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', () => {
      void app.close();
    });
  }

  /**
   * Truncates every table. Integration tests only — refuses to run unless
   * NODE_ENV is `test`, because losing a dev database to a stray call is a
   * bad afternoon and losing production is worse.
   */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAll() is only available when NODE_ENV=test');
    }
    const tables = await this.$queryRaw<Array<{ tablename: string }>>(
      Prisma.sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (tables.length === 0) return;
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');
    // asset_event has BEFORE DELETE/UPDATE triggers; TRUNCATE bypasses row
    // triggers by design, which is exactly what a test reset needs.
    await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import { JwtModule } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { AppConfigModule } from '../../src/config/config.module';
import { PrismaModule } from '../../src/common/prisma/prisma.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AllExceptionsFilter } from '../../src/common/errors';
import { JwtAuthGuard, RolesGuard } from '../../src/common/guards';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { AuthService } from '../../src/modules/auth/auth.service';
import { HealthModule } from '../../src/modules/health/health.module';
import { DashboardModule } from '../../src/modules/dashboard/dashboard.module';
import { AssetStateMachineModule } from '../../src/common/state-machine';
import { AssetsModule } from '../../src/modules/assets/assets.module';
import { AssignmentsModule } from '../../src/modules/assignments/assignments.module';
import { EmployeesModule } from '../../src/modules/employees/employees.module';
import { EventsModule } from '../../src/modules/events/events.module';
import { MastersModule } from '../../src/modules/masters/masters.module';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Boots the real application graph — same pipe, same filter, same guards — so
 * an integration test exercises the stack a request actually goes through.
 * Only the pino logger is left out, to keep the output readable.
 */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppConfigModule,
      PrismaModule,
      JwtModule.register({}),
      AssetStateMachineModule,
      AuthModule,
      HealthModule,
      DashboardModule,
      EventsModule,
      MastersModule,
      AssetsModule,
      AssignmentsModule,
      EmployeesModule,
    ],
    providers: [
      { provide: APP_PIPE, useClass: ZodValidationPipe },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();

  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1');
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

export interface SeededUser {
  id: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Creates an app user with a known password, ready to sign in with. */
export async function createUser(
  prisma: PrismaService,
  overrides: Partial<{ email: string; role: UserRole; isActive: boolean; password: string }> = {},
): Promise<SeededUser> {
  const password = overrides.password ?? 'Str0ng!Password';
  const email =
    overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const role = overrides.role ?? UserRole.ADMIN;

  const user = await prisma.appUser.create({
    data: {
      email,
      passwordHash: await AuthService.hashPassword(password),
      fullName: 'Test User',
      role,
      isActive: overrides.isActive ?? true,
    },
  });

  return { id: user.id, email, password, role };
}

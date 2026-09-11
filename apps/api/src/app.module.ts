import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppConfig, AppConfigModule } from './config/config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AssetStateMachineModule } from './common/state-machine';
import { AllExceptionsFilter } from './common/errors';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { EventsModule } from './modules/events/events.module';
import { MastersModule } from './modules/masters/masters.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL'),
          // Structured JSON in every environment except a developer's terminal.
          transport: config.get('LOG_PRETTY')
            ? {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
              }
            : undefined,
          genReqId: (req: IncomingMessage) =>
            (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
          customProps: () => ({ service: 'asset-api' }),
          // Nothing here should ever reach a log aggregator.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.currentPassword',
              'req.body.newPassword',
              'req.body.refreshToken',
              'res.headers["set-cookie"]',
            ],
            censor: '[redacted]',
          },
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url === '/api/v1/health',
          },
          customLogLevel: (_req: IncomingMessage, res: ServerResponse, err?: Error) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
        },
      }),
    }),
    PrismaModule,
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
    // Validation runs before anything else; the filter shapes whatever escapes.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: authenticate, then authorise.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

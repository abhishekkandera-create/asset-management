import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Env, validateEnv } from './env';

/** Typed accessor over ConfigService, so no string keys leak into services. */
export class AppConfig {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true }) as Env[K];
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  get isTest(): boolean {
    return this.get('NODE_ENV') === 'test';
  }
}

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // The repo root .env is symlinked into apps/api, so a single file drives
      // Prisma, the API and docker compose.
      envFilePath: ['.env'],
      validate: validateEnv,
    }),
  ],
  providers: [
    {
      provide: AppConfig,
      useFactory: (config: ConfigService<Env, true>) => new AppConfig(config),
      inject: [ConfigService],
    },
  ],
  exports: [AppConfig],
})
export class AppConfigModule {}

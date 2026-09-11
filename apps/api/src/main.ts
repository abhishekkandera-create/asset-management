import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';
import { patchNestJsSwagger } from 'nestjs-zod';
import { AppModule } from './app.module';
import { AppConfig } from './config/config.module';
import { PrismaService } from './common/prisma/prisma.service';
import { buildCorsMatcher } from './common/cors';

/** Makes @nestjs/swagger read Zod schemas off the DTOs (CLAUDE.md §3). */
patchNestJsSwagger();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(PinoLogger));
  const config = app.get(AppConfig);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: buildCorsMatcher(config.get('CORS_ORIGINS')),
    credentials: true,
  });
  app.enableShutdownHooks();
  await app.get(PrismaService).enableShutdownHooks(app);

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('IT Asset Management API')
        .setDescription(
          'Internal API for tracking hardware issued to employees. ' +
            'The current holder of an asset is always derived from the open assignment row.',
        )
        .setVersion('1.0')
        .addServer(config.get('API_BASE_URL'))
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get('API_PORT');
  await app.listen(port, '0.0.0.0');

  const logger = app.get(PinoLogger);
  logger.log(`API listening on http://localhost:${port}/api/v1`);
  if (!config.isProduction) {
    logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
  }
}

void bootstrap().catch((error: unknown) => {
  // Env validation failures land here, before a logger exists.
  console.error('Failed to start the API:\n', error instanceof Error ? error.message : error);
  process.exit(1);
});

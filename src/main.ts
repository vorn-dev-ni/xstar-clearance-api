import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<Env, true>);

  // Security headers.
  app.use(helmet());

  // CORS: `*` allows any origin, otherwise a comma-separated allowlist.
  const corsOrigin = config.get('CORS_ORIGIN', { infer: true });
  app.enableCors({
    origin:
      corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Reject unknown properties and coerce DTO types globally.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');

  // Clean shutdown on SIGINT/SIGTERM so Prisma disconnects gracefully.
  app.enableShutdownHooks();

  // OpenAPI docs at /docs.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('System X-Star API')
    .setDescription('Clearance operations, accounting & invoicing API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  await app.listen(config.get('PORT', { infer: true }));
}
void bootstrap();

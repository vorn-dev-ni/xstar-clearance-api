import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  );

  // Behind a reverse proxy/LB, resolve the real client IP from
  // X-Forwarded-For so per-IP rate limiting works correctly.
  if (config.get('TRUST_PROXY', { infer: true })) {
    app.set('trust proxy', 1);
  }

  // CORS: allow localhost/127.0.0.1 on any port, Vercel deployments (including xstar-clearance-admin.vercel.app),
  // and any explicitly configured origins (stripping accidental trailing slashes).
  const corsOrigin = config.get('CORS_ORIGIN', { infer: true });
  app.enableCors({
    origin: (
      requestOrigin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests without an Origin header (server-to-server, curl, mobile) or if wildcard `*`
      if (!requestOrigin || corsOrigin === '*') {
        return callback(null, true);
      }

      // Normalize origin by trimming whitespace and removing trailing slashes
      const cleanOrigin = requestOrigin.trim().replace(/\/+$/, '');

      // 1. Check if origin is localhost or 127.0.0.1 on any port
      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
        cleanOrigin,
      );

      // 2. Check if origin is xstar-clearance-admin.vercel.app or any Vercel preview domain for it
      const isVercelDomain =
        /^https?:\/\/([a-zA-Z0-9_-]+\.)?xstar-clearance-admin([a-zA-Z0-9_-]*)?\.vercel\.app$/i.test(
          cleanOrigin,
        );

      // 3. Check explicitly configured origins in CORS_ORIGIN
      const configuredOrigins = corsOrigin
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean);

      const isConfigured = configuredOrigins.some((o) => {
        if (o === cleanOrigin) return true;
        // If a configured origin is on vercel.app, allow any preview deployment of that base domain
        if (o.includes('.vercel.app')) {
          const baseVercelProject = o
            .replace(/^https?:\/\//i, '')
            .split('.vercel.app')[0];
          const vercelRegex = new RegExp(
            `^https?:\\/\\/([a-zA-Z0-9_-]+\\.)?${baseVercelProject}([a-zA-Z0-9_-]*)?\\.vercel\\.app$`,
            'i',
          );
          return vercelRegex.test(cleanOrigin);
        }
        return false;
      });

      if (isLocalhost || isVercelDomain || isConfigured) {
        return callback(null, true);
      }

      // Return false without throwing a server 500 error cleanly denying CORS
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Access-Control-Request-Method',
      'Access-Control-Request-Headers',
    ],
    exposedHeaders: ['Content-Disposition'],
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

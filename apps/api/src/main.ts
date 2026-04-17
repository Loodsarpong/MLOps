import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpProblemFilter } from './common/http/http-problem.filter';
import { loadConfig } from './config/env';

async function bootstrap() {
  const cfg = loadConfig();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: true,
  });

  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: cfg.CORS_ORIGINS.split(','),
    credentials: true,
  });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpProblemFilter());

  if (cfg.NODE_ENV !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('NaturalShea ERP API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }

  await app.listen(cfg.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API listening on :${cfg.PORT}`);
}

bootstrap();

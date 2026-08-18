import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { NextFunction, Response } from 'express';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/errors/http-exception.filter';
import { RequestWithId } from './common/logging/request-id.middleware';
import { setupSwagger } from './common/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 3000;

  app.setGlobalPrefix('v1');
  setupSwagger(app);
  app.enableCors();
  app.use((req: RequestWithId, res: Response, next: NextFunction) => {
    const header = req.header('x-request-id');
    const requestId =
      header && header.trim().length > 0 ? header : randomUUID();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  await app.listen(port);
  Logger.log(`Nexara API listening on http://localhost:${port}/v1`);
  Logger.log(`Swagger UI http://localhost:${port}/docs`);
}

void bootstrap();

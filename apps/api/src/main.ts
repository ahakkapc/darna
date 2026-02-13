import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe, ValidationError } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { HttpLoggingInterceptor } from './common/interceptors/http-logging.interceptor';

function flattenErrors(
  errors: ValidationError[],
  parent?: string,
): { path: string; message: string }[] {
  const result: { path: string; message: string }[] = [];
  for (const err of errors) {
    const field = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      for (const msg of Object.values(err.constraints)) {
        result.push({ path: field, message: msg });
      }
    }
    if (err.children && err.children.length > 0) {
      result.push(...flattenErrors(err.children, field));
    }
  }
  return result;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: 'http://localhost:3010', credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new HttpLoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        return new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: { fields: flattenErrors(errors) },
          },
        });
      },
    }),
  );
  const port = process.env.API_PORT ?? 3011;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
}
bootstrap();

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, ValidationPipe, ValidationError } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { HttpLoggingInterceptor } from '../src/common/interceptors/http-logging.interceptor';

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

describe('SPEC-03 — Error Model + RequestId + Logging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authCookies: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
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
    await app.init();

    prisma = app.get(PrismaService);

    // Register + login a user for authenticated guard tests
    const uniqueEmail = `errmodel-${Date.now()}@test.com`;
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: uniqueEmail, password: 'password1234', name: 'ErrTest' })
      .expect(201);
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: uniqueEmail, password: 'password1234' })
      .expect(200);
    authCookies = loginRes.headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── RequestId ──────────────────────────────────────────────────
  describe('RequestId', () => {
    it('client sends x-request-id → response echoes it back', async () => {
      const customId = 'test-request-id-abc-123';
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .set('x-request-id', customId)
        .expect(200);

      expect(res.headers['x-request-id']).toBe(customId);
    });

    it('no x-request-id → response has a generated one (non-empty)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
    });

    it('error response includes requestId in body', async () => {
      const customId = 'err-req-id-456';
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('x-request-id', customId)
        .expect(401);

      expect(res.body.requestId).toBe(customId);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBeDefined();
    });
  });

  // ─── Canon Error Format ─────────────────────────────────────────
  describe('Canon error format', () => {
    it('protected endpoint without auth → canon format with error.code + requestId', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .expect(401);

      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('requestId');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('missing x-org-id on tenant route (authenticated) → 400 ORG_CONTEXT_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/leads')
        .set('Cookie', authCookies)
        .expect(400);

      expect(res.body.error.code).toBe('ORG_CONTEXT_REQUIRED');
      expect(res.body.requestId).toBeDefined();
    });

    it('invalid UUID in x-org-id (authenticated) → 400 ORG_CONTEXT_INVALID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/leads')
        .set('Cookie', authCookies)
        .set('x-org-id', 'not-a-uuid')
        .expect(400);

      expect(res.body.error.code).toBe('ORG_CONTEXT_INVALID');
    });
  });

  // ─── Validation (VALIDATION_ERROR) ──────────────────────────────
  describe('ValidationPipe → VALIDATION_ERROR', () => {
    it('invalid register payload → 400 VALIDATION_ERROR with details.fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toBeDefined();
      expect(res.body.error.details.fields).toBeInstanceOf(Array);
      expect(res.body.error.details.fields.length).toBeGreaterThan(0);

      const paths = res.body.error.details.fields.map((f: { path: string }) => f.path);
      expect(paths).toContain('password');
    });

    it('unknown fields rejected (forbidNonWhitelisted)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: 'test@test.com', password: 'password1234', foo: 'bar' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─── Prisma error mapping ──────────────────────────────────────
  describe('Prisma error mapping → CONFLICT', () => {
    const uniqueEmail = `prisma-conflict-${Date.now()}@test.com`;

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: uniqueEmail } });
    });

    it('duplicate unique → 409 CONFLICT', async () => {
      // Create first user
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: uniqueEmail, password: 'password1234' })
        .expect(201);

      // AppError path: EMAIL_ALREADY_USED (409)
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email: uniqueEmail, password: 'password1234' })
        .expect(409);

      expect(res.body.error.code).toBe('EMAIL_ALREADY_USED');
      expect(res.body.requestId).toBeDefined();
    });
  });

  // ─── AppError codes ────────────────────────────────────────────
  describe('AppError codes mapping', () => {
    it('INVALID_CREDENTIALS → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'noone@nowhere.com', password: 'password1234' })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('REFRESH_INVALID → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .expect(401);

      expect(res.body.error.code).toBe('REFRESH_INVALID');
    });
  });
});

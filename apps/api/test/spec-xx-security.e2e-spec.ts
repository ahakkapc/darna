import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, ValidationPipe, ValidationError } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { HttpLoggingInterceptor } from '../src/common/interceptors/http-logging.interceptor';

function flattenErrors(errors: ValidationError[], parent?: string): { path: string; message: string }[] {
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

async function createApp() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
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
  return { app, prisma: app.get(PrismaService) };
}

async function registerAndLogin(app: INestApplication, email: string, password = 'password1234') {
  await request(app.getHttpServer()).post('/api/auth/register').send({ email, password });
  const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
  const cookies = loginRes.headers['set-cookie'] as unknown as string[];
  return { cookies };
}

describe('SPEC-XX — Security Hardening (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const TS = Date.now();
  const userEmail = `sec-user-${TS}@test.com`;
  const adminEmail = `sec-admin-${TS}@test.com`;
  let userCookies: string[];
  let adminCookies: string[];

  beforeAll(async () => {
    const setup = await createApp();
    app = setup.app;
    prisma = setup.prisma;

    const u = await registerAndLogin(app, userEmail);
    userCookies = u.cookies;

    const a = await registerAndLogin(app, adminEmail);
    adminCookies = a.cookies;
    await prisma.user.updateMany({
      where: { email: adminEmail },
      data: { platformRole: 'PLATFORM_ADMIN' },
    });
    const a2 = await registerAndLogin(app, adminEmail);
    adminCookies = a2.cookies;
  }, 30000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({});
    await app.close();
  }, 30000);

  // ─── Security Headers ──────────────────────────────────────────
  describe('Security headers', () => {
    it('GET /health returns security headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    });

    it('all responses include x-request-id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id'].length).toBeGreaterThan(0);
    });
  });

  // ─── Health endpoint enriched ──────────────────────────────────
  describe('Health endpoint', () => {
    it('returns db status and timestamp', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.db).toBe('up');
      expect(res.body.ts).toBeDefined();
      expect(new Date(res.body.ts).getTime()).toBeGreaterThan(0);
    });
  });

  // ─── Audit logging ─────────────────────────────────────────────
  describe('Audit logging', () => {
    it('login creates AUTH_LOGIN_SUCCESS audit entry', async () => {
      const email = `audit-login-${TS}@test.com`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'password1234' });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'password1234' });

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'AUTH_LOGIN_SUCCESS', actorLabel: email },
        orderBy: { createdAt: 'desc' },
      });

      expect(entry).not.toBeNull();
      expect(entry!.action).toBe('AUTH_LOGIN_SUCCESS');
      expect(entry!.targetType).toBe('USER');
      expect(entry!.actorLabel).toBe(email);
    });

    it('failed login creates AUTH_LOGIN_FAIL audit entry', async () => {
      const email = `audit-fail-${TS}@test.com`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'password1234' });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'wrongpassword' })
        .expect(401);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'AUTH_LOGIN_FAIL', actorLabel: email },
        orderBy: { createdAt: 'desc' },
      });

      expect(entry).not.toBeNull();
      expect(entry!.action).toBe('AUTH_LOGIN_FAIL');
    });

    it('refresh creates AUTH_REFRESH_SUCCESS audit entry', async () => {
      const email = `audit-refresh-${TS}@test.com`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'password1234' });

      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'password1234' });

      const cookies = loginRes.headers['set-cookie'] as unknown as string[];

      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookies)
        .expect(200);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'AUTH_REFRESH_SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });

      expect(entry).not.toBeNull();
    });

    it('audit entries have masked IP', async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: 'AUTH_LOGIN_SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });

      if (entry?.ip) {
        expect(entry.ip).toContain('*');
      }
    });
  });

  // ─── Admin audit endpoint ──────────────────────────────────────
  describe('Admin audit endpoint', () => {
    it('GET /admin/audit requires platform admin', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/audit')
        .set('Cookie', userCookies)
        .expect(403);
    });

    it('GET /admin/audit returns paginated results for admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/audit')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
    });

    it('GET /admin/audit supports action filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/audit?action=AUTH_LOGIN_SUCCESS')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.every((i: { action: string }) => i.action === 'AUTH_LOGIN_SUCCESS')).toBe(true);
    });
  });

  // ─── Rate limiting ─────────────────────────────────────────────
  describe('Rate limiting', () => {
    it('login rate limit returns 429 after too many attempts', async () => {
      const email = `rl-test-${TS}@test.com`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'password1234' });

      let got429 = false;
      for (let i = 0; i < 12; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email, password: 'wrongpassword' });
        if (res.status === 429) {
          got429 = true;
          expect(res.body.error.code).toBe('RATE_LIMITED');
          expect(res.body.error.details.retryAfterSeconds).toBeDefined();
          expect(res.headers['retry-after']).toBeDefined();
          break;
        }
      }

      expect(got429).toBe(true);
    });

    it('rate limit response includes X-RateLimit headers', async () => {
      const email = `rl-headers-${TS}@test.com`;
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'password1234' });

      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: 'password1234' });

      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });
});

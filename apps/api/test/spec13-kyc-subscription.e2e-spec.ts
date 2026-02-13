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

async function createOrg(app: INestApplication, cookies: string[], name: string) {
  const res = await request(app.getHttpServer())
    .post('/api/orgs')
    .set('Cookie', cookies)
    .send({ name });
  return res.body.orgId;
}

describe('SPEC-13 — KYC + Subscription + Moderation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const TS = Date.now();
  const managerEmail = `mgr-s13-${TS}@test.com`;
  const adminEmail = `admin-s13-${TS}@test.com`;
  const proEmail2 = `pro2-s13-${TS}@test.com`;
  let managerCookies: string[];
  let adminCookies: string[];
  let pro2Cookies: string[];
  let orgIdA: string;
  let orgIdB: string;

  beforeAll(async () => {
    const setup = await createApp();
    app = setup.app;
    prisma = setup.prisma;

    // Manager (org A)
    const m = await registerAndLogin(app, managerEmail);
    managerCookies = m.cookies;
    orgIdA = await createOrg(app, managerCookies, `OrgA-${TS}`);

    // Admin user
    const a = await registerAndLogin(app, adminEmail);
    adminCookies = a.cookies;
    // Set platform role directly
    await prisma.user.updateMany({ where: { email: adminEmail }, data: { platformRole: 'PLATFORM_ADMIN' } });
    // Re-login to get new JWT with platformRole
    const a2 = await registerAndLogin(app, adminEmail);
    adminCookies = a2.cookies;

    // Pro 2 (org B)
    const p = await registerAndLogin(app, proEmail2);
    pro2Cookies = p.cookies;
    orgIdB = await createOrg(app, pro2Cookies, `OrgB-${TS}`);
  });

  afterAll(async () => {
    await prisma.kycRequest.deleteMany({ where: { organizationId: { in: [orgIdA, orgIdB] } } });
    await prisma.offlinePayment.deleteMany({ where: { organizationId: { in: [orgIdA, orgIdB] } } });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: [orgIdA, orgIdB] } } });
    await app.close();
  });

  // ─── KYC ────────────────────────────────────────────────────────
  describe('KYC workflow', () => {
    it('GET /kyc/me → NOT_SUBMITTED initially', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/kyc/me')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(res.body.org.kycStatus).toBe('NOT_SUBMITTED');
      expect(res.body.org.isVerifiedPro).toBe(false);
    });

    let kycRequestId: string;

    it('POST /kyc/submit → creates request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/kyc/submit')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ registryNumber: '12345678', registryCity: 'Alger', legalName: 'Mon Agence' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      kycRequestId = res.body.requestId;
    });

    it('GET /kyc/me → SUBMITTED after submit', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/kyc/me')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(res.body.org.kycStatus).toBe('SUBMITTED');
    });

    it('admin GET /admin/kyc/queue → sees request', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/kyc/queue?status=SUBMITTED')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((r: any) => r.id === kycRequestId);
      expect(found).toBeDefined();
    });

    it('admin verify → org becomes verified', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/kyc/${kycRequestId}/verify`)
        .set('Cookie', adminCookies)
        .expect(201);

      const org = await prisma.org.findUnique({ where: { id: orgIdA } });
      expect(org?.kycStatus).toBe('VERIFIED');
      expect(org?.isVerifiedPro).toBe(true);
    });

    it('pro (non-admin) cannot access admin endpoints → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/kyc/queue')
        .set('Cookie', managerCookies)
        .expect(403);

      expect(res.body.error.code).toBe('ADMIN_ROLE_REQUIRED');
    });

    it('admin needs-changes → org kycStatus = NEEDS_CHANGES', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/kyc/${kycRequestId}/needs-changes`)
        .set('Cookie', adminCookies)
        .send({ reason: 'Missing document' })
        .expect(201);

      const org = await prisma.org.findUnique({ where: { id: orgIdA } });
      expect(org?.kycStatus).toBe('NEEDS_CHANGES');
      expect(org?.isVerifiedPro).toBe(false);
    });

    it('POST /kyc/resubmit → allowed after NEEDS_CHANGES', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/kyc/resubmit')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ registryNumber: '12345678', registryCity: 'Alger', legalName: 'Mon Agence v2' })
        .expect(201);

      expect(res.body.ok).toBe(true);
    });

    it('final admin verify → org verified again', async () => {
      const latest = await prisma.kycRequest.findFirst({
        where: { organizationId: orgIdA },
        orderBy: { submittedAt: 'desc' },
      });

      await request(app.getHttpServer())
        .post(`/api/admin/kyc/${latest!.id}/verify`)
        .set('Cookie', adminCookies)
        .expect(201);

      const org = await prisma.org.findUnique({ where: { id: orgIdA } });
      expect(org?.isVerifiedPro).toBe(true);
    });
  });

  // ─── Subscription ───────────────────────────────────────────────
  describe('Subscription workflow', () => {
    let subscriptionId: string;
    let paymentId: string;

    it('POST /subscriptions/choose-plan → PENDING_PAYMENT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/subscriptions/choose-plan')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ planCode: 'AGENCY_PRO' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      subscriptionId = res.body.subscriptionId;
    });

    it('GET /subscriptions/me → subscription exists', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/subscriptions/me')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(res.body.subscription).toBeDefined();
      expect(res.body.subscription.status).toBe('PENDING_PAYMENT');
      expect(res.body.isActive).toBe(false);
    });

    it('POST /subscriptions/:id/payments/offline → creates payment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/subscriptions/${subscriptionId}/payments/offline`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ amountDa: 5000, method: 'BANK_TRANSFER', reference: 'REF-001' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      paymentId = res.body.paymentId;
    });

    it('admin confirm payment → subscription ACTIVE', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/payments/${paymentId}/confirm`)
        .set('Cookie', adminCookies)
        .expect(201);

      const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
      expect(sub?.status).toBe('ACTIVE');
      expect(sub?.startAt).not.toBeNull();
      expect(sub?.endAt).not.toBeNull();
    });

    it('choose-plan again with active sub → 409', async () => {
      await request(app.getHttpServer())
        .post('/api/subscriptions/choose-plan')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ planCode: 'AGENCY_PRO' })
        .expect(409);
    });

    it('pro cannot access admin payments queue → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/payments/queue')
        .set('Cookie', managerCookies)
        .expect(403);
    });
  });

  // ─── Tenant isolation ──────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('orgB cannot see orgA KYC data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/kyc/me')
        .set('Cookie', pro2Cookies)
        .set('x-org-id', orgIdB)
        .expect(200);

      expect(res.body.org.kycStatus).toBe('NOT_SUBMITTED');
      expect(res.body.latestRequest).toBeNull();
    });
  });
});

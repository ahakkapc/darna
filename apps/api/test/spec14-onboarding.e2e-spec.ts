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

describe('SPEC-14 — Onboarding Wizard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const TS = Date.now();
  const managerEmail = `mgr-ob-${TS}@test.com`;
  const agentEmail = `agent-ob-${TS}@test.com`;
  const adminEmail = `admin-ob-${TS}@test.com`;
  const indieEmail = `indie-ob-${TS}@test.com`;
  const otherEmail = `other-ob-${TS}@test.com`;
  let managerCookies: string[];
  let agentCookies: string[];
  let adminCookies: string[];
  let indieCookies: string[];
  let otherCookies: string[];
  let orgIdA: string;
  let orgIdIndie: string;
  let orgIdOther: string;

  beforeAll(async () => {
    const setup = await createApp();
    app = setup.app;
    prisma = setup.prisma;

    // Manager org A (AGENCY)
    const m = await registerAndLogin(app, managerEmail);
    managerCookies = m.cookies;
    orgIdA = await createOrg(app, managerCookies, `Agency-${TS}`);

    // Agent in org A
    const ag = await registerAndLogin(app, agentEmail);
    agentCookies = ag.cookies;
    const inviteRes = await request(app.getHttpServer())
      .post(`/api/orgs/${orgIdA}/invite`)
      .set('Cookie', managerCookies)
      .send({ email: agentEmail, role: 'AGENT' });
    if (inviteRes.body.token) {
      await request(app.getHttpServer())
        .post('/api/orgs/invites/accept')
        .set('Cookie', agentCookies)
        .send({ token: inviteRes.body.token });
    }

    // Admin
    const a = await registerAndLogin(app, adminEmail);
    adminCookies = a.cookies;
    await prisma.user.updateMany({ where: { email: adminEmail }, data: { platformRole: 'PLATFORM_ADMIN' } });
    const a2 = await registerAndLogin(app, adminEmail);
    adminCookies = a2.cookies;

    // Independent agent
    const ind = await registerAndLogin(app, indieEmail);
    indieCookies = ind.cookies;
    orgIdIndie = await createOrg(app, indieCookies, `Indie-${TS}`);

    // Other org (for isolation)
    const oth = await registerAndLogin(app, otherEmail);
    otherCookies = oth.cookies;
    orgIdOther = await createOrg(app, otherCookies, `Other-${TS}`);
  }, 30000);

  afterAll(async () => {
    const orgIds = [orgIdA, orgIdIndie, orgIdOther].filter(Boolean);
    await prisma.orgOnboarding.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.listingModeration.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.listing.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.offlinePayment.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.kycRequest.deleteMany({ where: { organizationId: { in: orgIds } } });
    await app.close();
  }, 30000);

  // ─── Agency happy path ─────────────────────────────────────────
  describe('Agency happy path', () => {
    it('GET /onboarding/me → NOT_STARTED initially', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/onboarding/me')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(res.body.data.status).toBe('NOT_STARTED');
      expect(res.body.data.currentStep).toBe('ORG_PROFILE');
      expect(res.body.data.gates).toBeDefined();
      expect(res.body.data.gates.needsPayment).toBe(true);
      expect(res.body.data.gates.needsKyc).toBe(true);
    });

    it('POST /onboarding/start → IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/start')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.currentStep).toBe('ORG_PROFILE');
    });

    it('complete ORG_PROFILE without required fields → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'ORG_PROFILE' })
        .expect(400);

      expect(res.body.error.code).toBe('ORG_PROFILE_INCOMPLETE');
    });

    it('fill org profile via PATCH /orgs/me', async () => {
      await request(app.getHttpServer())
        .patch('/api/orgs/me')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ persona: 'AGENCY', phone: '0555123456', wilaya: 'Alger' })
        .expect(200);
    });

    it('complete ORG_PROFILE → advances to COLLABORATORS', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'ORG_PROFILE' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.currentStep).toBe('COLLABORATORS');
      expect(res.body.completedSteps.ORG_PROFILE).toBe(true);
    });

    it('wrong step order → 409', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'PLAN' })
        .expect(409);

      expect(res.body.error.code).toBe('INVALID_STEP_ORDER');
    });

    it('complete COLLABORATORS (skip OK for agency) → advances to PLAN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'COLLABORATORS' })
        .expect(201);

      expect(res.body.currentStep).toBe('PLAN');
    });

    it('complete PLAN requires subscription → 403', async () => {
      await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'PLAN' })
        .expect(403);
    });

    it('choose plan + complete PLAN', async () => {
      await request(app.getHttpServer())
        .post('/api/subscriptions/choose-plan')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ planCode: 'AGENCY_PRO' });

      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'PLAN' })
        .expect(201);

      expect(res.body.currentStep).toBe('PAYMENT_OFFLINE');
    });

    it('submit offline payment + complete PAYMENT_OFFLINE', async () => {
      const sub = await prisma.subscription.findFirst({
        where: { organizationId: orgIdA },
        orderBy: { createdAt: 'desc' },
      });

      await request(app.getHttpServer())
        .post(`/api/subscriptions/${sub!.id}/payments/offline`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ amountDa: 5000, method: 'CASH' });

      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'PAYMENT_OFFLINE' })
        .expect(201);

      expect(res.body.currentStep).toBe('KYC');
    });

    it('submit KYC + complete KYC', async () => {
      await request(app.getHttpServer())
        .post('/api/kyc/submit')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ registryNumber: '12345678', registryCity: 'Alger', legalName: 'Mon Agence' });

      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'KYC' })
        .expect(201);

      expect(res.body.currentStep).toBe('FIRST_LISTING');
    });

    it('create listing + complete FIRST_LISTING', async () => {
      await request(app.getHttpServer())
        .post('/api/listings')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({
          dealType: 'SALE',
          type: 'APARTMENT',
          wilaya: 'Alger',
          title: 'Mon premier bien test listing',
          priceDa: 12000000,
        });

      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ step: 'FIRST_LISTING' })
        .expect(201);

      expect(res.body.completedSteps.FIRST_LISTING).toBe(true);
    });

    it('POST /onboarding/complete → COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/complete')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(201);

      expect(res.body.status).toBe('COMPLETED');
    });

    it('GET /onboarding/me → COMPLETED + DONE', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/onboarding/me')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.currentStep).toBe('DONE');
    });

    it('step/back works for navigation', async () => {
      // Create fresh onboarding for step/back test on orgIdOther
      await request(app.getHttpServer())
        .patch('/api/orgs/me')
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdOther)
        .send({ persona: 'AGENCY', phone: '0555999888', wilaya: 'Oran' });

      await request(app.getHttpServer())
        .post('/api/onboarding/start')
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdOther);

      await request(app.getHttpServer())
        .post('/api/onboarding/step/complete')
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdOther)
        .send({ step: 'ORG_PROFILE' });

      // Now at COLLABORATORS, go back to ORG_PROFILE
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/step/back')
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdOther)
        .send({ to: 'ORG_PROFILE' })
        .expect(201);

      expect(res.body.currentStep).toBe('ORG_PROFILE');
    });

    it('step/back to forward step → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/onboarding/step/back')
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdOther)
        .send({ to: 'PLAN' })
        .expect(400);
    });
  });

  // ─── INDEPENDENT_AGENT persona ─────────────────────────────────
  describe('INDEPENDENT_AGENT persona', () => {
    it('setup indie profile', async () => {
      await request(app.getHttpServer())
        .patch('/api/orgs/me')
        .set('Cookie', indieCookies)
        .set('x-org-id', orgIdIndie)
        .send({ persona: 'INDEPENDENT_AGENT', phone: '0555111222', wilaya: 'Oran' })
        .expect(200);
    });

    it('start → profile already complete → skips ORG_PROFILE + COLLABORATORS → PLAN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/onboarding/start')
        .set('Cookie', indieCookies)
        .set('x-org-id', orgIdIndie)
        .expect(201);

      // start() detects profile complete + INDEPENDENT_AGENT → auto-advances to PLAN
      expect(res.body.currentStep).toBe('PLAN');

      // Verify via GET /me that both steps are marked completed
      const me = await request(app.getHttpServer())
        .get('/api/onboarding/me')
        .set('Cookie', indieCookies)
        .set('x-org-id', orgIdIndie)
        .expect(200);

      expect(me.body.data.completedSteps.ORG_PROFILE).toBe(true);
      expect(me.body.data.completedSteps.COLLABORATORS).toBe(true);
      expect(me.body.data.currentStep).toBe('PLAN');
    });
  });

  // ─── Tenant isolation ──────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('orgB cannot see orgA onboarding (separate state)', async () => {
      const resA = await request(app.getHttpServer())
        .get('/api/onboarding/me')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      const resIndie = await request(app.getHttpServer())
        .get('/api/onboarding/me')
        .set('Cookie', indieCookies)
        .set('x-org-id', orgIdIndie)
        .expect(200);

      // A is COMPLETED, indie is IN_PROGRESS
      expect(resA.body.data.status).toBe('COMPLETED');
      expect(resIndie.body.data.status).toBe('IN_PROGRESS');
    });
  });

  // ─── Gates computation ─────────────────────────────────────────
  describe('Gates', () => {
    it('gates reflect real data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/onboarding/me')
        .set('Cookie', indieCookies)
        .set('x-org-id', orgIdIndie)
        .expect(200);

      const gates = res.body.data.gates;
      expect(gates.needsPayment).toBe(true);
      expect(gates.needsKyc).toBe(true);
      expect(gates.canPublish).toBe(false);
      expect(gates.subscriptionStatus).toBe('INACTIVE');
      expect(gates.kycStatus).toBe('NOT_SUBMITTED');
    });
  });
});

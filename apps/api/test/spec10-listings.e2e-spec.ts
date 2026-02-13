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

const LISTING_DTO = {
  dealType: 'SALE',
  type: 'APARTMENT',
  wilaya: 'Alger',
  title: 'Bel appartement F3 centre',
  priceDa: 15000000,
  surfaceM2: 85,
  rooms: 3,
};

describe('SPEC-10 — Listings CRUD + Publish Gates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const TS = Date.now();
  const managerEmail = `mgr-s10-${TS}@test.com`;
  const agentEmail = `agent-s10-${TS}@test.com`;
  const adminEmail = `admin-s10-${TS}@test.com`;
  const pro2Email = `pro2-s10-${TS}@test.com`;
  let managerCookies: string[];
  let agentCookies: string[];
  let adminCookies: string[];
  let pro2Cookies: string[];
  let orgIdA: string;
  let orgIdB: string;
  let listingId: string;

  beforeAll(async () => {
    const setup = await createApp();
    app = setup.app;
    prisma = setup.prisma;

    // Manager org A
    const m = await registerAndLogin(app, managerEmail);
    managerCookies = m.cookies;
    orgIdA = await createOrg(app, managerCookies, `ListOrg-${TS}`);

    // Agent in org A (invite + accept)
    const ag = await registerAndLogin(app, agentEmail);
    agentCookies = ag.cookies;
    const inviteRes = await request(app.getHttpServer())
      .post(`/api/orgs/${orgIdA}/invite`)
      .set('Cookie', managerCookies)
      .send({ email: agentEmail, role: 'AGENT' });
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept')
      .set('Cookie', agentCookies)
      .send({ token: inviteRes.body.token });

    // Admin user
    const a = await registerAndLogin(app, adminEmail);
    adminCookies = a.cookies;
    await prisma.user.updateMany({ where: { email: adminEmail }, data: { platformRole: 'PLATFORM_ADMIN' } });
    const a2 = await registerAndLogin(app, adminEmail);
    adminCookies = a2.cookies;

    // Pro 2 (org B) for isolation tests
    const p2 = await registerAndLogin(app, pro2Email);
    pro2Cookies = p2.cookies;
    orgIdB = await createOrg(app, pro2Cookies, `ListOrgB-${TS}`);
  }, 30000);

  afterAll(async () => {
    const orgIds = [orgIdA, orgIdB].filter(Boolean);
    await prisma.listingModeration.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.listing.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.offlinePayment.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.subscription.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.kycRequest.deleteMany({ where: { organizationId: { in: orgIds } } });
    await app.close();
  }, 30000);

  // ─── CRUD ──────────────────────────────────────────────────────
  describe('Listing CRUD', () => {
    it('POST /listings → creates listing as DRAFT', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/listings')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send(LISTING_DTO)
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.wilaya).toBe('Alger');
      listingId = res.body.id;
    });

    it('GET /listings → lists org listings', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/listings')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /listings/:id → returns listing detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/listings/${listingId}`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(res.body.id).toBe(listingId);
      expect(res.body.title).toBe(LISTING_DTO.title);
    });

    it('PATCH /listings/:id → updates listing', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/listings/${listingId}`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ description: 'Lumineux, vue mer' })
        .expect(200);

      expect(res.body.description).toBe('Lumineux, vue mer');
    });

    it('agent sees only own listings with scope=me', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/listings?scope=me')
        .set('Cookie', agentCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });
  });

  // ─── Tenant isolation ──────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('orgB cannot see orgA listings', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/listings')
        .set('Cookie', pro2Cookies)
        .set('x-org-id', orgIdB)
        .expect(200);

      expect(res.body.length).toBe(0);
    });

    it('orgB cannot read orgA listing by ID → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/listings/${listingId}`)
        .set('Cookie', pro2Cookies)
        .set('x-org-id', orgIdB)
        .expect(404);
    });
  });

  // ─── Publish gates ─────────────────────────────────────────────
  describe('Publish gates', () => {
    it('publish without KYC → 403 KYC_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/listings/${listingId}/publish`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(403);

      expect(res.body.error.code).toBe('KYC_REQUIRED');
    });

    it('setup: verify KYC for org A', async () => {
      await request(app.getHttpServer())
        .post('/api/kyc/submit')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ registryNumber: '12345678', registryCity: 'Alger', legalName: 'Agence Test' });

      const req = await prisma.kycRequest.findFirst({
        where: { organizationId: orgIdA },
        orderBy: { submittedAt: 'desc' },
      });

      await request(app.getHttpServer())
        .post(`/api/admin/kyc/${req!.id}/verify`)
        .set('Cookie', adminCookies);
    });

    it('publish without subscription → 403 SUBSCRIPTION_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/listings/${listingId}/publish`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(403);

      expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    });

    it('setup: create and activate subscription for org A', async () => {
      const subRes = await request(app.getHttpServer())
        .post('/api/subscriptions/choose-plan')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ planCode: 'AGENCY_PRO' });

      const payRes = await request(app.getHttpServer())
        .post(`/api/subscriptions/${subRes.body.subscriptionId}/payments/offline`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ amountDa: 5000, method: 'CASH' });

      await request(app.getHttpServer())
        .post(`/api/admin/payments/${payRes.body.paymentId}/confirm`)
        .set('Cookie', adminCookies);
    });

    it('publish without moderation → 403 MODERATION_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/listings/${listingId}/publish`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(403);

      expect(res.body.error.code).toBe('MODERATION_REQUIRED');
    });

    it('submit for review → auto-approved (fields ok, no photo score)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/listings/${listingId}/submit-for-review`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(201);

      expect(res.body.ok).toBe(true);
    });

    it('admin approve moderation', async () => {
      await request(app.getHttpServer())
        .post(`/api/admin/moderation/${listingId}/approve`)
        .set('Cookie', adminCookies)
        .expect(201);
    });

    it('publish succeeds after all gates pass', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/listings/${listingId}/publish`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(201);

      expect(res.body.status).toBe('PUBLISHED');
      expect(res.body.publishedAt).toBeDefined();
    });
  });

  // ─── Pause ─────────────────────────────────────────────────────
  describe('Pause', () => {
    it('POST /listings/:id/pause → PAUSED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/listings/${listingId}/pause`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(201);

      expect(res.body.status).toBe('PAUSED');
    });
  });

  // ─── Transfer ──────────────────────────────────────────────────
  describe('Transfer', () => {
    it('manager transfers listing to agent', async () => {
      const agent = await prisma.user.findFirst({ where: { email: agentEmail } });
      const res = await request(app.getHttpServer())
        .post(`/api/listings/${listingId}/transfer`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .send({ ownerUserId: agent!.id })
        .expect(201);

      expect(res.body.ownerUserId).toBe(agent!.id);
    });
  });

  // ─── Soft delete ───────────────────────────────────────────────
  describe('Soft delete', () => {
    it('DELETE /listings/:id → soft deleted', async () => {
      await request(app.getHttpServer())
        .delete(`/api/listings/${listingId}`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      expect(listing?.recordStatus).toBe('DELETED');
      expect(listing?.deletedAt).not.toBeNull();
    });

    it('deleted listing not in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/listings')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgIdA)
        .expect(200);

      const found = res.body.find((l: any) => l.id === listingId);
      expect(found).toBeUndefined();
    });
  });

  // ─── Admin RBAC ────────────────────────────────────────────────
  describe('Admin RBAC', () => {
    it('pro cannot access admin moderation queue → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/moderation/queue')
        .set('Cookie', managerCookies)
        .expect(403);

      expect(res.body.error.code).toBe('ADMIN_ROLE_REQUIRED');
    });
  });
});

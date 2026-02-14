import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-01 — Tenant Isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgA: { id: string };
  let orgB: { id: string };
  let leadA: { id: string };
  let leadB: { id: string };
  let cookiesA: string[];
  let cookiesB: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Clean slate
    await prisma.taskReminder.deleteMany();
    await prisma.task.deleteMany();
    await prisma.leadActivity.deleteMany();
    await prisma.leadRelation.deleteMany();
    await prisma.orgOnboarding.deleteMany();
    await prisma.listingModeration.deleteMany();
    await prisma.listingLeadRelation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.offlinePayment.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.kycRequest.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.orgInvite.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.orgMembership.deleteMany();
    await prisma.org.deleteMany();
    await prisma.user.deleteMany();

    // Register + login users for auth
    const userAData = { email: 'ti-usera@test.com', password: 'password1234', name: 'UserA' };
    const userBData = { email: 'ti-userb@test.com', password: 'password1234', name: 'UserB' };

    const regA = await request(app.getHttpServer()).post('/api/auth/register').send(userAData).expect(201);
    const regB = await request(app.getHttpServer()).post('/api/auth/register').send(userBData).expect(201);

    const loginA = await request(app.getHttpServer()).post('/api/auth/login').send({ email: userAData.email, password: userAData.password }).expect(200);
    const loginB = await request(app.getHttpServer()).post('/api/auth/login').send({ email: userBData.email, password: userBData.password }).expect(200);
    cookiesA = loginA.headers['set-cookie'] as unknown as string[];
    cookiesB = loginB.headers['set-cookie'] as unknown as string[];

    // Seed: Org A + Org B
    orgA = await prisma.org.create({ data: { name: 'Org A' } });
    orgB = await prisma.org.create({ data: { name: 'Org B' } });

    // Add memberships
    await prisma.orgMembership.create({ data: { userId: regA.body.id, orgId: orgA.id, role: 'OWNER' } });
    await prisma.orgMembership.create({ data: { userId: regB.body.id, orgId: orgB.id, role: 'OWNER' } });

    // Seed: Lead A (belongs to Org A) — use withOrg to satisfy RLS
    const { withOrg } = await import('../src/tenancy/with-org');

    leadA = await withOrg(prisma, orgA.id, (tx) =>
      tx.lead.create({
        data: { organizationId: orgA.id, fullName: 'Lead Alpha', phone: '0600000001' },
      }),
    );

    leadB = await withOrg(prisma, orgB.id, (tx) =>
      tx.lead.create({
        data: { organizationId: orgB.id, fullName: 'Lead Beta', phone: '0600000002' },
      }),
    );
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.taskReminder.deleteMany();
      await prisma.task.deleteMany();
      await prisma.leadActivity.deleteMany();
      await prisma.leadRelation.deleteMany();
      await prisma.orgOnboarding.deleteMany();
      await prisma.listingModeration.deleteMany();
      await prisma.listingLeadRelation.deleteMany();
      await prisma.listing.deleteMany();
      await prisma.offlinePayment.deleteMany();
      await prisma.subscription.deleteMany();
      await prisma.kycRequest.deleteMany();
      await prisma.lead.deleteMany();
      await prisma.orgInvite.deleteMany();
      await prisma.refreshToken.deleteMany();
      await prisma.orgMembership.deleteMany();
      await prisma.org.deleteMany();
      await prisma.user.deleteMany();
    } catch { /* best-effort */ }
    await app.close();
  }, 30000);

  // ─── T1: List isolation ──────────────────────────────────────────
  describe('T1 — List isolation', () => {
    it('GET /api/crm/leads with x-org-id=A returns only Lead A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/leads')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgA.id)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(leadA.id);
      expect(res.body.items[0].fullName).toBe('Lead Alpha');
    });

    it('GET /api/crm/leads with x-org-id=B returns only Lead B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/leads')
        .set('Cookie', cookiesB)
        .set('x-org-id', orgB.id)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(leadB.id);
      expect(res.body.items[0].fullName).toBe('Lead Beta');
    });
  });

  // ─── T2: Read isolation (anti-IDOR) ─────────────────────────────
  describe('T2 — Read isolation (anti-IDOR)', () => {
    it('GET /api/crm/leads/:idLeadB with x-org-id=A → 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadB.id}`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgA.id)
        .expect(404);

      expect(res.body.error.code).toBe('LEAD_NOT_FOUND');
    });

    it('GET /api/crm/leads/:idLeadB with x-org-id=B → 200', async () => {
      await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadB.id}`)
        .set('Cookie', cookiesB)
        .set('x-org-id', orgB.id)
        .expect(200);
    });
  });

  // ─── T3: Update isolation ───────────────────────────────────────
  describe('T3 — Update isolation', () => {
    it('PATCH Lead B with org A → 404 (not 403)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/crm/leads/${leadB.id}`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgA.id)
        .send({ fullName: 'Hacked' })
        .expect(404);

      expect(res.body.error.code).toBe('LEAD_NOT_FOUND');
    });
  });

  // ─── T4: Delete isolation ───────────────────────────────────────
  describe('T4 — Delete isolation', () => {
    it('DELETE Lead B with org A → 404', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/crm/leads/${leadB.id}`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgA.id)
        .expect(404);

      expect(res.body.error.code).toBe('LEAD_NOT_FOUND');
    });
  });

  // ─── T5: RLS bypass proof (bug app simulé) ─────────────────────
  describe('T5 — RLS bypass proof (query without where orgId)', () => {
    it('tx.lead.findMany() without orgId filter under org A context returns only A leads', async () => {
      const { withOrg } = await import('../src/tenancy/with-org');

      // Simulates a "dev forgot the where clause" bug
      const results = await withOrg(prisma, orgA.id, (tx) =>
        tx.lead.findMany(),
      ) as Array<{ organizationId: string }>;

      // RLS should only return leads belonging to org A
      expect(results.every((l: { organizationId: string }) => l.organizationId === orgA.id)).toBe(true);
      expect(results.some((l: { organizationId: string }) => l.organizationId === orgB.id)).toBe(false);
    });
  });

  // ─── Guard validation tests ─────────────────────────────────────
  describe('OrgContextGuard — validation', () => {
    it('Unauthenticated request → 401 UNAUTHENTICATED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/leads')
        .expect(401);

      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('Missing x-org-id (with auth) → 400 ORG_CONTEXT_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/leads')
        .set('Cookie', cookiesA)
        .expect(400);

      expect(res.body.error.code).toBe('ORG_CONTEXT_REQUIRED');
    });

    it('Invalid UUID x-org-id (with auth) → 400 ORG_CONTEXT_INVALID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/leads')
        .set('Cookie', cookiesA)
        .set('x-org-id', 'not-a-uuid')
        .expect(400);

      expect(res.body.error.code).toBe('ORG_CONTEXT_INVALID');
    });

    it('Non-existent org UUID (with auth) → 404 ORG_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/leads')
        .set('Cookie', cookiesA)
        .set('x-org-id', '00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body.error.code).toBe('ORG_NOT_FOUND');
    });
  });
});

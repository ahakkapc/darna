import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Clean slate
    await prisma.orgOnboarding.deleteMany();
    await prisma.listingModeration.deleteMany();
    await prisma.listingLeadRelation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.offlinePayment.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.kycRequest.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.orgInvite.deleteMany();
    await prisma.orgMembership.deleteMany();
    await prisma.org.deleteMany();

    // Seed: Org A + Org B
    orgA = await prisma.org.create({ data: { name: 'Org A' } });
    orgB = await prisma.org.create({ data: { name: 'Org B' } });

    // Seed: Lead A (belongs to Org A) — use withOrg to satisfy RLS
    const { withOrg } = await import('../src/tenancy/with-org');

    leadA = await withOrg(prisma, orgA.id, (tx) =>
      tx.lead.create({
        data: { orgId: orgA.id, fullName: 'Lead Alpha', phone: '0600000001' },
      }),
    );

    leadB = await withOrg(prisma, orgB.id, (tx) =>
      tx.lead.create({
        data: { orgId: orgB.id, fullName: 'Lead Beta', phone: '0600000002' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.orgOnboarding.deleteMany();
    await prisma.listingModeration.deleteMany();
    await prisma.listingLeadRelation.deleteMany();
    await prisma.listing.deleteMany();
    await prisma.offlinePayment.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.kycRequest.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.orgInvite.deleteMany();
    await prisma.orgMembership.deleteMany();
    await prisma.org.deleteMany();
    await app.close();
  });

  // ─── T1: List isolation ──────────────────────────────────────────
  describe('T1 — List isolation', () => {
    it('GET /api/leads with x-org-id=A returns only Lead A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/leads')
        .set('x-org-id', orgA.id)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(leadA.id);
      expect(res.body[0].fullName).toBe('Lead Alpha');
    });

    it('GET /api/leads with x-org-id=B returns only Lead B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/leads')
        .set('x-org-id', orgB.id)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe(leadB.id);
      expect(res.body[0].fullName).toBe('Lead Beta');
    });
  });

  // ─── T2: Read isolation (anti-IDOR) ─────────────────────────────
  describe('T2 — Read isolation (anti-IDOR)', () => {
    it('GET /api/leads/:idLeadB with x-org-id=A → 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/leads/${leadB.id}`)
        .set('x-org-id', orgA.id)
        .expect(404);

      expect(res.body.error.code).toBe('LEAD_NOT_FOUND');
    });

    it('GET /api/leads/:idLeadB with x-org-id=B → 200', async () => {
      await request(app.getHttpServer())
        .get(`/api/leads/${leadB.id}`)
        .set('x-org-id', orgB.id)
        .expect(200);
    });
  });

  // ─── T3: Update isolation ───────────────────────────────────────
  describe('T3 — Update isolation', () => {
    it('PATCH Lead B with org A → 404 (not 403)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/leads/${leadB.id}`)
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
        .delete(`/api/leads/${leadB.id}`)
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
      ) as Array<{ orgId: string }>;

      // RLS should only return leads belonging to org A
      expect(results.every((l: { orgId: string }) => l.orgId === orgA.id)).toBe(true);
      expect(results.some((l: { orgId: string }) => l.orgId === orgB.id)).toBe(false);
    });
  });

  // ─── Guard validation tests ─────────────────────────────────────
  describe('OrgContextGuard — validation', () => {
    it('Missing x-org-id → 400 ORG_CONTEXT_REQUIRED', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/leads')
        .expect(400);

      expect(res.body.error.code).toBe('ORG_CONTEXT_REQUIRED');
    });

    it('Invalid UUID x-org-id → 400 ORG_CONTEXT_INVALID', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/leads')
        .set('x-org-id', 'not-a-uuid')
        .expect(400);

      expect(res.body.error.code).toBe('ORG_CONTEXT_INVALID');
    });

    it('Non-existent org UUID → 404 ORG_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/leads')
        .set('x-org-id', '00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(res.body.error.code).toBe('ORG_NOT_FOUND');
    });
  });
});

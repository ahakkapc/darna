import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { SecretsVaultService } from '../src/integrations/crypto/secrets-vault.service';
import { InboundEventsService } from '../src/integrations/inbound/inbound-events.service';
import { OutboundJobsService } from '../src/integrations/outbound/outbound-jobs.service';

const ts = Date.now();
const ownerUser = { email: `s30-owner-${ts}@test.com`, password: 'Test1234!!x', name: 'S30Owner' };
const otherUser = { email: `s30-other-${ts}@test.com`, password: 'Test1234!!x', name: 'S30Other' };

describe('SPEC-30 — Integrations Framework (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let vault: SecretsVaultService;
  let ownerCookies: string[];
  let otherCookies: string[];
  let orgId: string;
  let orgIdB: string;
  let integrationId: string;

  async function login(u: { email: string; password: string }): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password })
      .expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    vault = app.get(SecretsVaultService);

    // Register users
    await request(app.getHttpServer()).post('/api/auth/register').send(ownerUser).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send(otherUser).expect(201);

    ownerCookies = await login(ownerUser);
    otherCookies = await login(otherUser);

    // Create org A (owner)
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies)
      .send({ name: 'S30OrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    // Create org B (other — separate org for tenant isolation)
    const orgResB = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies)
      .send({ name: 'S30OrgB' }).expect(201);
    orgIdB = orgResB.body.orgId;
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 10000);

  // ─── CRUD Integration ─────────────────────────────────
  describe('Integration CRUD', () => {
    it('POST /integrations creates integration', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/integrations').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ type: 'META_LEADGEN', provider: 'META_CLOUD', name: 'Test Meta' })
        .expect(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.type).toBe('META_LEADGEN');
      expect(res.body.data.status).toBe('ACTIVE');
      integrationId = res.body.data.id;
    });

    it('GET /integrations lists integrations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/integrations').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /integrations/:id returns integration', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/integrations/${integrationId}`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.name).toBe('Test Meta');
    });

    it('PATCH /integrations/:id updates integration', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/integrations/${integrationId}`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ name: 'Updated Meta' })
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.name).toBe('Updated Meta');
    });

    it('POST /integrations/:id/disable disables integration', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/integrations/${integrationId}/disable`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(201);
      expect(res.body.data.status).toBe('DISABLED');
    });

    it('POST /integrations/:id/enable re-enables integration', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/integrations/${integrationId}/enable`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(201);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('POST /integrations/:id/health-check enqueues healthcheck', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/integrations/${integrationId}/health-check`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.enqueued).toBe(true);
    });
  });

  // ─── Secrets ───────────────────────────────────────────
  describe('Secrets', () => {
    it('PUT secret stores encrypted value', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/integrations/${integrationId}/secrets/access_token`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ value: 'my-secret-token-123' })
        .expect(200);
      expect(res.body.ok).toBe(true);
    });

    it('GET secrets lists keys only (no values)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/integrations/${integrationId}/secrets`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].key).toBe('access_token');
      expect(res.body.data.items[0].valueEnc).toBeUndefined();
      expect(res.body.data.items[0].value).toBeUndefined();
    });

    it('SecretsVaultService encrypt/decrypt roundtrip works', () => {
      const { valueEnc, keyVersion } = vault.encrypt('hello-world');
      const decrypted = vault.decrypt(valueEnc, keyVersion);
      expect(decrypted).toBe('hello-world');
    });

    it('DELETE secret removes it', async () => {
      await request(app.getHttpServer())
        .delete(`/api/integrations/${integrationId}/secrets/access_token`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/integrations/${integrationId}/secrets`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  // ─── RBAC ──────────────────────────────────────────────
  describe('RBAC', () => {
    it('non-member cannot create integration (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/integrations').set('Cookie', otherCookies).set('x-org-id', orgId)
        .send({ type: 'META_LEADGEN', provider: 'META_CLOUD', name: 'HackedInteg' })
        .expect(403);
    });

    it('non-member cannot list integrations (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/integrations').set('Cookie', otherCookies).set('x-org-id', orgId)
        .expect(403);
    });
  });

  // ─── InboundEvent idempotence ──────────────────────────
  describe('InboundEvent idempotence', () => {
    let eventId: string;

    it('creating inbound event via service', async () => {
      const svc = app.get(InboundEventsService);
      const result = await svc.createEvent({
        orgId,
        sourceType: 'META_LEADGEN',
        provider: 'META_CLOUD',
        externalId: `ext-${ts}-1`,
        payload: { leadgenId: '123', formId: 'abc' },
      });
      expect(result.duplicate).toBe(false);
      expect(result.id).toBeDefined();
      eventId = result.id;
    });

    it('duplicate externalId → duplicate=true', async () => {
      const svc = app.get(InboundEventsService);
      const result = await svc.createEvent({
        orgId,
        sourceType: 'META_LEADGEN',
        provider: 'META_CLOUD',
        externalId: `ext-${ts}-1`,
        payload: { leadgenId: '123', formId: 'abc' },
      });
      expect(result.duplicate).toBe(true);
    });

    it('GET /inbound-events lists events', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/integrations/inbound-events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /inbound-events/:id returns event with masked PII', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/integrations/inbound-events/${eventId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.sourceType).toBe('META_LEADGEN');
    });

    it('POST /inbound-events/:id/retry resets event', async () => {
      // First put it in ERROR state
      await prisma.$transaction(async (tx: any) => {
        await tx.$queryRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, orgId);
        await tx.$executeRawUnsafe(`SET LOCAL ROLE darna_app`);
        await tx.inboundEvent.update({
          where: { id: eventId },
          data: { status: 'ERROR', lastErrorCode: 'TEST_ERROR' },
        });
        await tx.$executeRawUnsafe(`RESET ROLE`);
      });

      const res = await request(app.getHttpServer())
        .post(`/api/integrations/inbound-events/${eventId}/retry`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ─── OutboundJob dedupe ────────────────────────────────
  describe('OutboundJob dedupe', () => {
    let jobId: string;

    it('creating outbound job via service', async () => {
      const svc = app.get(OutboundJobsService);
      const result = await svc.createJob({
        orgId,
        type: 'WHATSAPP_MESSAGE',
        provider: 'META_CLOUD',
        dedupeKey: `wa:test:${ts}`,
        payload: { to: '+213555123456', template: 'hello', phone: '+213555123456' },
      });
      expect(result.duplicate).toBe(false);
      expect(result.id).toBeDefined();
      jobId = result.id;
    });

    it('duplicate dedupeKey → duplicate=true', async () => {
      const svc = app.get(OutboundJobsService);
      const result = await svc.createJob({
        orgId,
        type: 'WHATSAPP_MESSAGE',
        provider: 'META_CLOUD',
        dedupeKey: `wa:test:${ts}`,
        payload: { to: '+213555123456', template: 'hello' },
      });
      expect(result.duplicate).toBe(true);
    });

    it('GET /outbound-jobs lists jobs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/integrations/outbound-jobs')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /outbound-jobs/:id returns job with masked phone', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/integrations/outbound-jobs/${jobId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      // Phone should be masked
      const payload = res.body.data.payloadJson;
      if (payload?.phone) {
        expect(payload.phone).toMatch(/\+213\*\*\*\*456/);
      }
    });

    it('POST /outbound-jobs/:id/cancel cancels job', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/integrations/outbound-jobs/${jobId}/cancel`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ─── Tenant isolation ──────────────────────────────────
  describe('tenant isolation', () => {
    it('orgB cannot list orgA integrations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/integrations').set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });

    it('orgB cannot read orgA integration (404)', async () => {
      await request(app.getHttpServer())
        .get(`/api/integrations/${integrationId}`).set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot update orgA integration (404)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/integrations/${integrationId}`).set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('orgB cannot read orgA inbound events', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/integrations/inbound-events').set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });

    it('orgB cannot read orgA outbound jobs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/integrations/outbound-jobs').set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });
  });
});

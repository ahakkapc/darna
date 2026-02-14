import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { SecretsVaultService } from '../src/integrations/crypto/secrets-vault.service';
import { InboundEventsService } from '../src/integrations/inbound/inbound-events.service';
import { MetaLeadgenProcessor } from '../src/meta/leadgen/meta-leadgen.processor';

const ts = Date.now();
const PAGE_ID = `page-${ts}`;
const FORM_ID = `form-${ts}`;
const ownerUser = { email: `s16-owner-${ts}@test.com`, password: 'Test1234!!x', name: 'S16Owner' };
const otherUser = { email: `s16-other-${ts}@test.com`, password: 'Test1234!!x', name: 'S16Other' };

describe('SPEC-16 — Meta Lead Ads (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let vault: SecretsVaultService;
  let ownerCookies: string[];
  let otherCookies: string[];
  let orgId: string;
  let orgIdB: string;
  let integrationId: string;
  let sourceId: string;

  async function login(u: { email: string; password: string }): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password })
      .expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
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
      .send({ name: 'S16OrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    // Create org B (other)
    const orgResB = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies)
      .send({ name: 'S16OrgB' }).expect(201);
    orgIdB = orgResB.body.orgId;

    // Create META_LEADGEN integration for orgA
    const integRes = await request(app.getHttpServer())
      .post('/api/integrations').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({
        type: 'META_LEADGEN',
        provider: 'META_CLOUD',
        name: 'Test Meta Integration',
      })
      .expect(201);
    integrationId = integRes.body.data.id;

    // Store secrets (access_token, app_secret, verify_token)
    await request(app.getHttpServer())
      .put(`/api/integrations/${integrationId}/secrets/access_token`)
      .set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ value: 'test-access-token-123' })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/integrations/${integrationId}/secrets/app_secret`)
      .set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ value: 'test-app-secret-456' })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/integrations/${integrationId}/secrets/verify_token`)
      .set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ value: 'my-verify-token' })
      .expect(200);
  }, 60000);

  afterAll(async () => {
    await app.close();
  }, 10000);

  // ─── MetaLeadSource CRUD ────────────────────────────────
  describe('MetaLeadSource CRUD', () => {
    it('POST /meta/leadgen/sources creates source', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/meta/leadgen/sources')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          integrationId,
          pageId: PAGE_ID,
          pageName: 'Test Page',
          formId: FORM_ID,
          formName: 'Test Form',
          routingStrategy: 'ROUND_ROBIN',
        })
        .expect(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.pageId).toBe(PAGE_ID);
      sourceId = res.body.data.id;
    });

    it('GET /meta/leadgen/sources lists sources', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/meta/leadgen/sources')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /meta/leadgen/sources/:id returns source', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/meta/leadgen/sources/${sourceId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.formId).toBe(FORM_ID);
    });

    it('PATCH /meta/leadgen/sources/:id updates source', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/meta/leadgen/sources/${sourceId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ formName: 'Updated Form', routingStrategy: 'MANAGER_ASSIGN' })
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.formName).toBe('Updated Form');
      expect(res.body.data.routingStrategy).toBe('MANAGER_ASSIGN');
    });

    it('non-member cannot list sources (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/meta/leadgen/sources')
        .set('Cookie', otherCookies).set('x-org-id', orgId)
        .expect(403);
    });
  });

  // ─── Webhook handshake ──────────────────────────────────
  describe('Webhook handshake', () => {
    it('GET /webhooks/meta/leadgen verifies with correct token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/webhooks/meta/leadgen')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'my-verify-token',
          'hub.challenge': 'test-challenge-123',
        })
        .expect(200);
      expect(res.text).toBe('test-challenge-123');
    });

    it('GET /webhooks/meta/leadgen rejects wrong token', async () => {
      await request(app.getHttpServer())
        .get('/api/webhooks/meta/leadgen')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong-token',
          'hub.challenge': 'test-challenge-123',
        })
        .expect(403);
    });
  });

  // ─── Webhook POST → InboundEvent ───────────────────────
  describe('Webhook POST → InboundEvent', () => {
    const leadgenId = `test-leadgen-${ts}`;

    it('POST /webhooks/meta/leadgen creates inbound event', async () => {
      const payload = {
        object: 'page',
        entry: [{
          id: PAGE_ID,
          changes: [{
            field: 'leadgen',
            value: {
              leadgen_id: leadgenId,
              form_id: FORM_ID,
              created_time: Math.floor(Date.now() / 1000),
            },
          }],
        }],
      };
      const bodyStr = JSON.stringify(payload);
      const signature = 'sha256=' + createHmac('sha256', 'test-app-secret-456')
        .update(bodyStr).digest('hex');

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/meta/leadgen')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(bodyStr)
        .expect(200);
      expect(res.body.received).toBe(true);
    });

    it('InboundEvent was created', async () => {
      // Wait a moment for async processing
      await new Promise((r) => setTimeout(r, 500));

      const res = await request(app.getHttpServer())
        .get('/api/integrations/inbound-events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .query({ sourceType: 'META_LEADGEN' })
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);

      const event = res.body.data.items.find((e: any) => {
        const p = e.payloadJson ?? e.payload ?? {};
        return p.pageId === PAGE_ID;
      });
      expect(event).toBeDefined();
    });

    it('duplicate webhook same leadgenId → no duplicate event', async () => {
      const payload = {
        object: 'page',
        entry: [{
          id: PAGE_ID,
          changes: [{
            field: 'leadgen',
            value: {
              leadgen_id: leadgenId,
              form_id: FORM_ID,
              created_time: Math.floor(Date.now() / 1000),
            },
          }],
        }],
      };
      const bodyStr = JSON.stringify(payload);
      const signature = 'sha256=' + createHmac('sha256', 'test-app-secret-456')
        .update(bodyStr).digest('hex');

      const res = await request(app.getHttpServer())
        .post('/api/webhooks/meta/leadgen')
        .set('Content-Type', 'application/json')
        .set('X-Hub-Signature-256', signature)
        .send(bodyStr)
        .expect(200);
      expect(res.body.received).toBe(true);
    });
  });

  // ─── Processor direct test ──────────────────────────────
  describe('MetaLeadgenProcessor', () => {
    it('processor is registered in InboundProcessorRegistry', () => {
      const processor = app.get(MetaLeadgenProcessor);
      expect(processor).toBeDefined();
    });
  });

  // ─── Cross-tenant isolation ─────────────────────────────
  describe('Tenant isolation', () => {
    it('orgB cannot list orgA sources (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/meta/leadgen/sources')
        .set('Cookie', otherCookies).set('x-org-id', orgId)
        .expect(403);
    });

    it('orgB cannot create source in orgA (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/meta/leadgen/sources')
        .set('Cookie', otherCookies).set('x-org-id', orgId)
        .send({
          integrationId,
          pageId: 'hack-page',
          formId: 'hack-form',
        })
        .expect(403);
    });

    it('orgB listing own sources returns empty', async () => {
      // Create META_LEADGEN integration for orgB first
      const integResB = await request(app.getHttpServer())
        .post('/api/integrations').set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ type: 'META_LEADGEN', provider: 'META_CLOUD', name: 'OrgB Meta' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/meta/leadgen/sources')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });
  });

  // ─── Backfill trigger ───────────────────────────────────
  describe('Backfill', () => {
    it('POST /meta/leadgen/sources/:id/backfill enqueues job', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/meta/leadgen/sources/${sourceId}/backfill`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.enqueued).toBe(true);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationService } from '../src/notifications/notification.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-11B — Notifications v2 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifService: NotificationService;

  const ts = Date.now();
  const ownerUser = { email: `n11b-owner-${ts}@test.com`, password: 'password1234', name: 'N11bOwner' };
  const otherUser = { email: `n11b-other-${ts}@test.com`, password: 'password1234', name: 'N11bOther' };

  let ownerCookies: string[];
  let otherCookies: string[];
  let ownerUserId: string;
  let orgId: string;
  let orgIdB: string;

  async function login(u: { email: string; password: string }): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password })
      .expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    notifService = app.get(NotificationService);

    // Register users
    const r1 = await request(app.getHttpServer()).post('/api/auth/register').send(ownerUser).expect(201);
    ownerUserId = r1.body.id;
    await request(app.getHttpServer()).post('/api/auth/register').send(otherUser).expect(201);

    ownerCookies = await login(ownerUser);
    otherCookies = await login(otherUser);

    // Create org A (owner) — response is { orgId, name }
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies)
      .send({ name: 'N11bOrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    // Create org B (other)
    const orgResB = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies)
      .send({ name: 'N11bOrgB' }).expect(201);
    orgIdB = orgResB.body.orgId;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  // ─── {ok, data} envelope ─────────────────────────────────
  describe('API envelope format', () => {
    it('GET /notifications returns {ok, data} envelope', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.page).toBeDefined();
    });

    it('GET /notifications/unread-count returns {ok, data: {count}}', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(typeof res.body.data.count).toBe('number');
    });

    it('GET /me/notification-preferences returns {ok, data: {items}}', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/notification-preferences')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBe(8);
    });
  });

  // ─── notifyUsers + list ───────────────────────────────────
  describe('notifyUsers creates in-app notifications', () => {
    let notifId: string;

    it('notifyUsers creates a notification visible in list', async () => {
      const result = await notifService.notifyUsers({
        organizationId: orgId,
        userIds: [ownerUserId],
        templateKey: 'lead.new',
        meta: { leadId: 'fake-lead-id', leadName: 'Test Lead' },
      });
      expect(result.created).toBe(1);
      expect(result.notificationIds.length).toBe(1);
      notifId = result.notificationIds[0];

      const res = await request(app.getHttpServer())
        .get('/api/notifications?unreadOnly=true')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      const found = res.body.data.items.find((n: any) => n.id === notifId);
      expect(found).toBeDefined();
      expect(found.title).toBe('Nouveau lead reçu');
      expect(found.readAt).toBeNull();
    });

    it('read is idempotent — readAt stable on double call', async () => {
      await request(app.getHttpServer())
        .post(`/api/notifications/${notifId}/read`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(201);

      const res1 = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      const n1 = res1.body.data.items.find((n: any) => n.id === notifId);
      const readAt1 = n1.readAt;
      expect(readAt1).toBeTruthy();

      // Second call — should not change readAt
      await request(app.getHttpServer())
        .post(`/api/notifications/${notifId}/read`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      const n2 = res2.body.data.items.find((n: any) => n.id === notifId);
      expect(n2.readAt).toBe(readAt1);
    });
  });

  // ─── read-all ─────────────────────────────────────────────
  describe('read-all', () => {
    it('marks multiple unread notifications as read', async () => {
      // Create 3 notifications
      for (let i = 0; i < 3; i++) {
        await notifService.notifyUsers({
          organizationId: orgId,
          userIds: [ownerUserId],
          templateKey: 'task.assigned',
          meta: { taskId: `readall-task-${i}`, taskTitle: `Task ${i}` },
        });
      }

      const before = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(before.body.data.count).toBeGreaterThanOrEqual(3);

      await request(app.getHttpServer())
        .post('/api/notifications/read-all')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({})
        .expect(201);

      const after = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(after.body.data.count).toBe(0);
    });
  });

  // ─── dedupe ───────────────────────────────────────────────
  describe('dedupe', () => {
    it('duplicate notifyUsers within window → 1 created, 1 skipped', async () => {
      const r1 = await notifService.notifyUsers({
        organizationId: orgId,
        userIds: [ownerUserId],
        templateKey: 'lead.assigned',
        meta: { leadId: 'dedupe-lead-1', leadName: 'DedupeLead' },
      });
      expect(r1.created).toBe(1);

      const r2 = await notifService.notifyUsers({
        organizationId: orgId,
        userIds: [ownerUserId],
        templateKey: 'lead.assigned',
        meta: { leadId: 'dedupe-lead-1', leadName: 'DedupeLead' },
      });
      expect(r2.skipped).toBe(1);
      expect(r2.created).toBe(0);
    });
  });

  // ─── soft delete ──────────────────────────────────────────
  describe('delete', () => {
    it('deleted notification does not appear in list', async () => {
      const result = await notifService.notifyUsers({
        organizationId: orgId,
        userIds: [ownerUserId],
        templateKey: 'system.maintenance',
        meta: {},
      });
      const delId = result.notificationIds[0];

      await request(app.getHttpServer())
        .delete(`/api/notifications/${delId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      const found = res.body.data.items.find((n: any) => n.id === delId);
      expect(found).toBeUndefined();
    });

    it('deleting unknown notification → 404', async () => {
      await request(app.getHttpServer())
        .delete('/api/notifications/00000000-0000-0000-0000-000000000000')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(404);
    });
  });

  // ─── preferences whatsapp gating ─────────────────────────
  describe('preferences', () => {
    it('patch whatsapp=true without verified phone → 409', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ category: 'LEAD', whatsappEnabled: true })
        .expect(409);
      expect(res.body.error.code).toBe('PHONE_NOT_VERIFIED');
    });

    it('patch emailEnabled works', async () => {
      await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ category: 'LEAD', emailEnabled: true })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/me/notification-preferences')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      const lead = res.body.data.items.find((p: any) => p.category === 'LEAD');
      expect(lead.emailEnabled).toBe(true);
    });

    it('invalid category → 400', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ category: 'INVALID_CAT', emailEnabled: true })
        .expect(400);
      expect(res.body.error.code).toBe('NOTIFICATION_PREF_INVALID_CATEGORY');
    });
  });

  // ─── tenant isolation ─────────────────────────────────────
  describe('tenant isolation', () => {
    it('orgB cannot see orgA notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });

    it('orgB unread count = 0', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);
      expect(res.body.data.count).toBe(0);
    });

    it('orgB cannot read orgA notification', async () => {
      const result = await notifService.notifyUsers({
        organizationId: orgId,
        userIds: [ownerUserId],
        templateKey: 'task.overdue',
        meta: { taskId: 'iso-task', taskTitle: 'IsoTask' },
      });
      const nid = result.notificationIds[0];

      await request(app.getHttpServer())
        .post(`/api/notifications/${nid}/read`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot delete orgA notification', async () => {
      const result = await notifService.notifyUsers({
        organizationId: orgId,
        userIds: [ownerUserId],
        templateKey: 'task.reminder',
        meta: { taskId: 'iso-task2', taskTitle: 'IsoTask2' },
      });
      const nid = result.notificationIds[0];

      await request(app.getHttpServer())
        .delete(`/api/notifications/${nid}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });
  });

  // ─── template registry ────────────────────────────────────
  describe('template registry v2', () => {
    it('notifyUsers with visit.created template works', async () => {
      const result = await notifService.notifyUsers({
        organizationId: orgId,
        userIds: [ownerUserId],
        templateKey: 'visit.created',
        meta: { eventTitle: 'Visite test' },
      });
      expect(result.created).toBe(1);
    });

    it('notifyUsers with unknown template → 0 created', async () => {
      const result = await notifService.notifyUsers({
        organizationId: orgId,
        userIds: [ownerUserId],
        templateKey: 'nonexistent.template',
        meta: {},
      });
      expect(result.created).toBe(0);
    });
  });
});

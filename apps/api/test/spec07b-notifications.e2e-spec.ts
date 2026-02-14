import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationService } from '../src/notifications/notification.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-07B — Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationService: NotificationService;

  const ownerUser = { email: 'notif-owner@test.com', password: 'password1234', name: 'NotifOwner' };
  const otherUser = { email: 'notif-other@test.com', password: 'password1234', name: 'NotifOther' };

  let ownerCookies: string[];
  let otherCookies: string[];
  let ownerUserId: string;
  let otherUserId: string;
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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    notificationService = app.get(NotificationService);

    // Clean slate
    await prisma.taskReminder.deleteMany();
    await prisma.task.deleteMany();
    await prisma.notificationDispatch.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.notificationPreference.deleteMany();
    await prisma.leadActivity.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.orgInvite.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.orgMembership.deleteMany();
    await prisma.org.deleteMany();
    await prisma.user.deleteMany();

    // Register users
    const regOwner = await request(app.getHttpServer())
      .post('/api/auth/register').send(ownerUser).expect(201);
    ownerUserId = regOwner.body.id;

    const regOther = await request(app.getHttpServer())
      .post('/api/auth/register').send(otherUser).expect(201);
    otherUserId = regOther.body.id;

    ownerCookies = await login(ownerUser);
    otherCookies = await login(otherUser);

    // Create org A
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs')
      .set('Cookie', ownerCookies)
      .send({ name: 'NotifOrgA' })
      .expect(201);
    orgId = orgRes.body.orgId;

    // Create org B (other user)
    const orgBRes = await request(app.getHttpServer())
      .post('/api/orgs')
      .set('Cookie', otherCookies)
      .send({ name: 'NotifOrgB' })
      .expect(201);
    orgIdB = orgBRes.body.orgId;
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.taskReminder.deleteMany();
      await prisma.task.deleteMany();
      await prisma.notificationDispatch.deleteMany();
      await prisma.notification.deleteMany();
      await prisma.notificationPreference.deleteMany();
      await prisma.leadActivity.deleteMany();
      await prisma.lead.deleteMany();
      await prisma.orgInvite.deleteMany();
      await prisma.refreshToken.deleteMany();
      await prisma.orgMembership.deleteMany();
      await prisma.org.deleteMany();
      await prisma.user.deleteMany();
    } catch { /* best-effort */ }
    await app.close();
  }, 30000);

  // ─── CREATE + LIST ────────────────────────────────────────────────
  describe('Create & List', () => {
    it('service creates notification → appears in GET /api/notifications', async () => {
      const result = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'LEAD',
        templateKey: 'lead.new',
        meta: { leadId: '00000000-0000-0000-0000-000000000001', leadName: 'Test Lead' },
      });
      expect(result.id).toBeDefined();
      expect(result.deduplicated).toBe(false);

      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const notif = res.body.data.items.find((n: any) => n.id === result.id);
      expect(notif).toBeDefined();
      expect(notif.title).toBe('Nouveau lead reçu');
      expect(notif.category).toBe('LEAD');
      expect(notif.readAt).toBeNull();
    });

    it('unread-count reflects unread notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.data.count).toBeGreaterThanOrEqual(1);
    });

    it('unreadOnly=true returns only unread', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications?unreadOnly=true')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      for (const item of res.body.data.items) {
        expect(item.readAt).toBeNull();
      }
    });

    it('category filter returns only matching category', async () => {
      // create a BILLING notif
      await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'BILLING',
        templateKey: 'billing.past_due',
        meta: {},
      });

      const res = await request(app.getHttpServer())
        .get('/api/notifications?category=BILLING')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      for (const item of res.body.data.items) {
        expect(item.category).toBe('BILLING');
      }
    });
  });

  // ─── DEDUPE ───────────────────────────────────────────────────────
  describe('Dedupe', () => {
    it('duplicate notification within window → deduplicated=true', async () => {
      const meta = { leadId: '00000000-0000-0000-0000-aaaaaaaaaaaa' };

      const first = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'LEAD',
        templateKey: 'lead.assigned',
        meta,
      });
      expect(first.deduplicated).toBe(false);

      const second = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'LEAD',
        templateKey: 'lead.assigned',
        meta,
      });
      expect(second.deduplicated).toBe(true);
      expect(second.id).toBe(first.id);
    });

    it('different meta → not deduplicated', async () => {
      const first = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'TASK',
        templateKey: 'task.assigned',
        meta: { taskId: '00000000-0000-0000-0000-bbbbbbbbbbbb' },
      });

      const second = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'TASK',
        templateKey: 'task.assigned',
        meta: { taskId: '00000000-0000-0000-0000-cccccccccccc' },
      });

      expect(second.deduplicated).toBe(false);
      expect(second.id).not.toBe(first.id);
    });
  });

  // ─── READ ─────────────────────────────────────────────────────────
  describe('Mark read', () => {
    let notifId: string;

    beforeAll(async () => {
      const result = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'SYSTEM',
        templateKey: 'kyc.submitted',
        meta: {},
      });
      notifId = result.id;
    });

    it('POST /api/notifications/:id/read → marks as read', async () => {
      await request(app.getHttpServer())
        .post(`/api/notifications/${notifId}/read`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/notifications?unreadOnly=true')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const found = res.body.data.items.find((n: any) => n.id === notifId);
      expect(found).toBeUndefined();
    });

    it('POST /api/notifications/read-all → marks all as read', async () => {
      // create some unread
      await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'LISTING',
        templateKey: 'listing.approved',
        meta: { listingId: '00000000-0000-0000-0000-dddddddddddd' },
      });

      await request(app.getHttpServer())
        .post('/api/notifications/read-all')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.data.count).toBe(0);
    });

    it('read-all with category filter only marks that category', async () => {
      await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'LEAD',
        templateKey: 'lead.new',
        meta: { leadId: '00000000-0000-0000-0000-eeeeeeeeeeee' },
      });
      await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'KYC',
        templateKey: 'kyc.approved',
        meta: {},
      });

      await request(app.getHttpServer())
        .post('/api/notifications/read-all')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ category: 'LEAD' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/notifications?unreadOnly=true')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const kycUnread = res.body.data.items.filter((n: any) => n.category === 'KYC');
      expect(kycUnread.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── SOFT DELETE ──────────────────────────────────────────────────
  describe('Soft delete', () => {
    it('DELETE /api/notifications/:id → soft deletes', async () => {
      const result = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'SYSTEM',
        templateKey: 'kyc.rejected',
        meta: { reason: 'Documents illisibles' },
      });

      await request(app.getHttpServer())
        .delete(`/api/notifications/${result.id}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const found = res.body.data.items.find((n: any) => n.id === result.id);
      expect(found).toBeUndefined();
    });

    it('DELETE unknown notif → 404', async () => {
      await request(app.getHttpServer())
        .delete('/api/notifications/00000000-0000-0000-0000-ffffffffffff')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(404);
    });
  });

  // ─── PREFERENCES ──────────────────────────────────────────────────
  describe('Preferences', () => {
    it('GET /api/me/notification-preferences returns all categories with defaults', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/me/notification-preferences')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.data.items.length).toBe(8);
      const lead = res.body.data.items.find((p: any) => p.category === 'LEAD');
      expect(lead).toBeDefined();
      expect(lead.inAppEnabled).toBe(true);
    });

    it('PATCH /api/me/notification-preferences → updates emailEnabled', async () => {
      await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ category: 'LEAD', emailEnabled: true })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/me/notification-preferences')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const lead = res.body.data.items.find((p: any) => p.category === 'LEAD');
      expect(lead.emailEnabled).toBe(true);
    });

    it('PATCH with invalid category → 400 NOTIFICATION_PREF_INVALID_CATEGORY', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ category: 'INVALID_CAT', emailEnabled: true })
        .expect(400);

      expect(res.body.error.code).toBe('NOTIFICATION_PREF_INVALID_CATEGORY');
    });

    it('PATCH whatsappEnabled=true → 409 PHONE_NOT_VERIFIED', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ category: 'LEAD', whatsappEnabled: true })
        .expect(409);

      expect(res.body.error.code).toBe('PHONE_NOT_VERIFIED');
    });
  });

  // ─── EMAIL DISPATCH ───────────────────────────────────────────────
  describe('Email dispatch', () => {
    it('notification with emailEnabled creates dispatch PENDING', async () => {
      // First enable email for TASK category
      await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ category: 'TASK', emailEnabled: true })
        .expect(200);

      const result = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'TASK',
        templateKey: 'task.overdue',
        meta: { taskId: '00000000-0000-0000-0000-111111111111' },
      });

      // Check dispatch was created
      const dispatches = await prisma.notificationDispatch.findMany({
        where: { notificationId: result.id },
      });

      expect(dispatches.length).toBe(1);
      expect(dispatches[0].channel).toBe('EMAIL');
      expect(dispatches[0].state).toBe('PENDING');
    });
  });

  // ─── TENANT ISOLATION ────────────────────────────────────────────
  describe('Tenant isolation', () => {
    let notifIdA: string;

    beforeAll(async () => {
      const result = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'LEAD',
        templateKey: 'lead.new',
        meta: { leadId: '00000000-0000-0000-0000-222222222222' },
      });
      notifIdA = result.id;
    });

    it('orgB user cannot list orgA notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .expect(200);

      const found = res.body.data.items.find((n: any) => n.id === notifIdA);
      expect(found).toBeUndefined();
    });

    it('orgB user cannot read orgA notification → 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/notifications/${notifIdA}/read`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB user cannot delete orgA notification → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/api/notifications/${notifIdA}`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .expect(404);
    });
  });

  // ─── CURSOR PAGINATION ────────────────────────────────────────────
  describe('Cursor pagination', () => {
    beforeAll(async () => {
      // Create several notifications
      for (let i = 0; i < 5; i++) {
        await notificationService.createNotification({
          orgId,
          userId: ownerUserId,
          category: 'SYSTEM',
          templateKey: 'billing.period_ending',
          meta: { invoiceId: `inv-${i}` },
          dedupeWindowSec: 0,
        });
      }
    });

    it('paginate with limit=2 walks all items', async () => {
      let cursor: string | undefined;
      let allIds: string[] = [];
      let pages = 0;

      do {
        const url = cursor
          ? `/api/notifications?limit=2&cursor=${cursor}`
          : '/api/notifications?limit=2';
        const res = await request(app.getHttpServer())
          .get(url)
          .set('Cookie', ownerCookies)
          .set('x-org-id', orgId)
          .expect(200);

        allIds = allIds.concat(res.body.data.items.map((n: any) => n.id));
        cursor = res.body.data.page.nextCursor;
        pages++;

        if (!res.body.data.page.hasMore) break;
      } while (pages < 20);

      // Should have fetched all notifications (at least 5 from this test + earlier ones)
      expect(allIds.length).toBeGreaterThanOrEqual(5);
      // No duplicate IDs
      expect(new Set(allIds).size).toBe(allIds.length);
    });
  });

  // ─── TEMPLATE RENDERING ──────────────────────────────────────────
  describe('Template rendering', () => {
    it('title is truncated to 120 chars', async () => {
      const result = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'LISTING',
        templateKey: 'listing.rejected',
        meta: {
          listingId: '00000000-0000-0000-0000-333333333333',
          reason: 'A'.repeat(600),
        },
        dedupeWindowSec: 0,
      });

      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const notif = res.body.data.items.find((n: any) => n.id === result.id);
      expect(notif).toBeDefined();
      expect(notif.title.length).toBeLessThanOrEqual(120);
    });
  });

  // ─── SANITIZE META ───────────────────────────────────────────────
  describe('Meta sanitization', () => {
    it('PII fields (email, phone) are stripped from metaJson', async () => {
      const result = await notificationService.createNotification({
        orgId,
        userId: ownerUserId,
        category: 'LEAD',
        templateKey: 'lead.new',
        meta: {
          leadId: '00000000-0000-0000-0000-444444444444',
          email: 'secret@test.com',
          phone: '+213555000000',
          leadName: 'Safe Name',
        },
        dedupeWindowSec: 0,
      });

      // Verify directly in DB
      const notif = await prisma.notification.findUnique({
        where: { id: result.id },
      });

      const meta = notif?.metaJson as Record<string, unknown>;
      expect(meta).toBeDefined();
      expect(meta.leadId).toBe('00000000-0000-0000-0000-444444444444');
      expect(meta.leadName).toBe('Safe Name');
      expect(meta.email).toBeUndefined();
      expect(meta.phone).toBeUndefined();
    });
  });
});

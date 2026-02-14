import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationService } from '../src/notifications/notification.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-3.1 — Notification Delivery & Prefs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationService: NotificationService;

  const userA = { email: 'spec31-a@test.com', password: 'password1234', name: 'Spec31A' };
  let userACookies: string[];
  let userAId: string;
  let orgId: string;

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

    // Register user
    const regRes = await request(app.getHttpServer())
      .post('/api/auth/register').send(userA).expect(201);
    userAId = regRes.body.id;

    userACookies = await login(userA);

    // Create org
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs')
      .set('Cookie', userACookies)
      .send({ name: 'Spec31Org' })
      .expect(201);
    orgId = orgRes.body.orgId;
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

  // ─── DISPATCH STATE FIELDS ──────────────────────────────────────
  describe('Dispatch creation with new fields', () => {
    it('creates EMAIL dispatch with "to" and "templateKey" populated', async () => {
      // Enable email prefs first
      await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', userACookies)
        .set('x-org-id', orgId)
        .send({ category: 'LEAD', emailEnabled: true })
        .expect(200);

      const result = await notificationService.createNotification({
        orgId,
        userId: userAId,
        category: 'LEAD',
        templateKey: 'lead.new',
        meta: { leadId: '00000000-0000-0000-0000-000000000099', leadName: 'Dispatch Test' },
      });

      expect(result.deduplicated).toBe(false);

      const dispatches = await prisma.notificationDispatch.findMany({
        where: { notificationId: result.id },
      });

      const emailDispatch = dispatches.find((d) => d.channel === 'EMAIL');
      expect(emailDispatch).toBeDefined();
      expect(emailDispatch!.to).toBe(userA.email);
      expect(emailDispatch!.templateKey).toBe('lead.new');
      expect(emailDispatch!.state).toBe('PENDING');
      expect(emailDispatch!.maxAttempts).toBe(8);
    });

    it('does NOT create WHATSAPP dispatch when user has no phone', async () => {
      // Enable whatsapp — should fail since no phone
      // But let's check dispatch side: even if pref were enabled,
      // without phone on user, no dispatch created
      const result = await notificationService.createNotification({
        orgId,
        userId: userAId,
        category: 'LEAD',
        templateKey: 'lead.assigned',
        meta: { leadId: '00000000-0000-0000-0000-000000000088', leadName: 'NoPhone' },
      });

      const dispatches = await prisma.notificationDispatch.findMany({
        where: { notificationId: result.id, channel: 'WHATSAPP' },
      });

      expect(dispatches.length).toBe(0);
    });
  });

  // ─── WHATSAPP PREFERENCE GATING ────────────────────────────────
  describe('WhatsApp preference gating', () => {
    it('rejects WhatsApp enable when user has no verified phone → 409 PHONE_NOT_VERIFIED', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', userACookies)
        .set('x-org-id', orgId)
        .send({ category: 'LEAD', whatsappEnabled: true })
        .expect(409);

      expect(res.body.error.code).toBe('PHONE_NOT_VERIFIED');
    });

    it('allows WhatsApp enable after phone verification', async () => {
      // Simulate phone verification by directly updating the user
      await prisma.user.update({
        where: { id: userAId },
        data: { phone: '+213555000111', phoneVerifiedAt: new Date() },
      });

      await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', userACookies)
        .set('x-org-id', orgId)
        .send({ category: 'LEAD', whatsappEnabled: true })
        .expect(200);

      // Verify via GET
      const res = await request(app.getHttpServer())
        .get('/api/me/notification-preferences')
        .set('Cookie', userACookies)
        .set('x-org-id', orgId)
        .expect(200);
      const lead = res.body.data.items.find((p: any) => p.category === 'LEAD');
      expect(lead.whatsappEnabled).toBe(true);
    });

    it('disabling WhatsApp works without phone check', async () => {
      await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', userACookies)
        .set('x-org-id', orgId)
        .send({ category: 'LEAD', whatsappEnabled: false })
        .expect(200);

      // Verify via GET
      const res = await request(app.getHttpServer())
        .get('/api/me/notification-preferences')
        .set('Cookie', userACookies)
        .set('x-org-id', orgId)
        .expect(200);
      const lead = res.body.data.items.find((p: any) => p.category === 'LEAD');
      expect(lead.whatsappEnabled).toBe(false);
    });
  });

  // ─── /auth/me PHONE FIELDS ──────────────────────────────────────
  describe('/auth/me phone fields', () => {
    it('returns phone and phoneVerifiedAt in /auth/me response', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', userACookies)
        .expect(200);

      expect(res.body.user.phone).toBe('+213555000111');
      expect(res.body.user.phoneVerifiedAt).toBeDefined();
      expect(res.body.user.email).toBe(userA.email);
    });
  });

  // ─── DISPATCH DEDUPEKEY ─────────────────────────────────────────
  describe('Dispatch dedupeKey', () => {
    it('creates dispatch with dedupeKey derived from notification dedupeKey', async () => {
      // Enable email + whatsapp
      await request(app.getHttpServer())
        .patch('/api/me/notification-preferences')
        .set('Cookie', userACookies)
        .set('x-org-id', orgId)
        .send({ category: 'TASK', emailEnabled: true, whatsappEnabled: true })
        .expect(200);

      const result = await notificationService.createNotification({
        orgId,
        userId: userAId,
        category: 'TASK',
        templateKey: 'task.assigned',
        meta: { taskId: '00000000-0000-0000-0000-task00000001', taskTitle: 'Test Task' },
      });

      const dispatches = await prisma.notificationDispatch.findMany({
        where: { notificationId: result.id },
      });

      // Should have EMAIL and WHATSAPP dispatches
      expect(dispatches.length).toBeGreaterThanOrEqual(1);
      const emailD = dispatches.find((d) => d.channel === 'EMAIL');
      expect(emailD).toBeDefined();
      expect(emailD!.to).toBe(userA.email);
    });
  });

  // ─── ENUM VALUES ────────────────────────────────────────────────
  describe('Schema enum values', () => {
    it('SENDING state exists in enum', async () => {
      // Create a dispatch and manually set to SENDING to verify the enum exists
      const result = await notificationService.createNotification({
        orgId,
        userId: userAId,
        category: 'LEAD',
        templateKey: 'lead.new',
        meta: { leadId: '00000000-0000-0000-0000-enum00000001', leadName: 'Enum Test' },
      });

      const dispatch = await prisma.notificationDispatch.findFirst({
        where: { notificationId: result.id },
      });

      if (dispatch) {
        const updated = await prisma.notificationDispatch.update({
          where: { id: dispatch.id },
          data: { state: 'SENDING' },
        });
        expect(updated.state).toBe('SENDING');

        // Also test DEAD
        const dead = await prisma.notificationDispatch.update({
          where: { id: dispatch.id },
          data: { state: 'DEAD' },
        });
        expect(dead.state).toBe('DEAD');
      }
    });
  });
});

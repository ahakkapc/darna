import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-09 — Planning & Visites (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerUser = { email: 'plan-owner@test.com', password: 'password1234', name: 'PlanOwner' };
  const agentUser = { email: 'plan-agent@test.com', password: 'password1234', name: 'PlanAgent' };
  const otherUser = { email: 'plan-other@test.com', password: 'password1234', name: 'PlanOther' };

  let ownerCookies: string[];
  let agentCookies: string[];
  let otherCookies: string[];
  let ownerUserId: string;
  let agentUserId: string;
  let otherUserId: string;
  let orgId: string;
  let orgIdB: string;
  let leadId: string;

  async function login(u: { email: string; password: string }): Promise<string[]> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: u.email, password: u.password })
      .expect(200);
    return res.headers['set-cookie'] as unknown as string[];
  }

  function tomorrow(hour: number, min = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, min, 0, 0);
    return d.toISOString();
  }

  function daysFromNow(n: number, hour = 10): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    // Clean slate
    await prisma.calendarEvent.deleteMany();
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
    const regOwner = await request(app.getHttpServer()).post('/api/auth/register').send(ownerUser).expect(201);
    ownerUserId = regOwner.body.id;
    const regAgent = await request(app.getHttpServer()).post('/api/auth/register').send(agentUser).expect(201);
    agentUserId = regAgent.body.id;
    const regOther = await request(app.getHttpServer()).post('/api/auth/register').send(otherUser).expect(201);
    otherUserId = regOther.body.id;

    ownerCookies = await login(ownerUser);
    agentCookies = await login(agentUser);
    otherCookies = await login(otherUser);

    // Create org A (owner)
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies)
      .send({ name: 'PlanOrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    // Invite agent to org A
    const invRes = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`).set('Cookie', ownerCookies)
      .send({ email: agentUser.email, role: 'AGENT' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept').set('Cookie', agentCookies)
      .send({ token: invRes.body.token }).expect(200);

    // Create org B (other user, for tenant isolation)
    const orgBRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies)
      .send({ name: 'PlanOrgB' }).expect(201);
    orgIdB = orgBRes.body.orgId;

    // Create a lead in org A
    const leadRes = await request(app.getHttpServer())
      .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ fullName: 'Plan Lead', phone: '+213555111222' }).expect(201);
    leadId = leadRes.body.id;
  }, 60000);

  afterAll(async () => {
    try {
      await prisma.calendarEvent.deleteMany();
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

  // ─── CREATE ─────────────────────────────────────────────────
  describe('Create event', () => {
    it('owner creates VISIT event → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Visite Appart Alger',
          assigneeUserId: ownerUserId,
          startAt: tomorrow(14),
          endAt: tomorrow(15),
          leadId,
          wilaya: 'Alger',
          commune: 'Bab El Oued',
        })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBeDefined();
    });

    it('manager creates event for agent → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'Réunion agent',
          assigneeUserId: agentUserId,
          startAt: daysFromNow(2, 10),
          endAt: daysFromNow(2, 11),
        })
        .expect(201);

      expect(res.body.ok).toBe(true);
    });

    it('agent creates event for self → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({
          type: 'CALL_SLOT',
          title: 'Créneau appels',
          assigneeUserId: agentUserId,
          startAt: daysFromNow(3, 9),
          endAt: daysFromNow(3, 10),
        })
        .expect(201);

      expect(res.body.ok).toBe(true);
    });

    it('agent creates event for owner → 403 ROLE_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Visite pour owner',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(4, 14),
          endAt: daysFromNow(4, 15),
        })
        .expect(403);

      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    });

    it('assignee not in org → 400 ASSIGNEE_NOT_MEMBER', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Visite inconnu',
          assigneeUserId: otherUserId,
          startAt: daysFromNow(5, 14),
          endAt: daysFromNow(5, 15),
        })
        .expect(400);

      expect(res.body.error.code).toBe('ASSIGNEE_NOT_MEMBER');
    });

    it('title too short → 400 validation error', async () => {
      await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'A',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(6, 14),
          endAt: daysFromNow(6, 15),
        })
        .expect(400);
    });
  });

  // ─── DATE VALIDATION ────────────────────────────────────────
  describe('Date validation', () => {
    it('startAt >= endAt → 400 EVENT_INVALID_RANGE', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'Invalid range',
          assigneeUserId: ownerUserId,
          startAt: tomorrow(15),
          endAt: tomorrow(14),
        })
        .expect(400);

      expect(res.body.error.code).toBe('EVENT_INVALID_RANGE');
    });

    it('duration > 8h → 400 EVENT_DURATION_TOO_LONG', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'Too long',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(7, 8),
          endAt: daysFromNow(7, 17),
        })
        .expect(400);

      expect(res.body.error.code).toBe('EVENT_DURATION_TOO_LONG');
    });
  });

  // ─── CONFLICT ───────────────────────────────────────────────
  describe('Overlap conflict', () => {
    let conflictEventId: string;

    it('create base event 14:00-14:30 → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Conflict Base',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(10, 14),
          endAt: daysFromNow(10, 14) .replace(':00:00.', ':30:00.'),
        })
        .expect(201);

      conflictEventId = res.body.data.id;
    });

    it('overlapping event 14:15-15:00 same assignee → 409 EVENT_TIME_CONFLICT', async () => {
      const start = daysFromNow(10, 14).replace(':00:00.', ':15:00.');
      const end = daysFromNow(10, 15);

      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'Conflict Overlap',
          assigneeUserId: ownerUserId,
          startAt: start,
          endAt: end,
        })
        .expect(409);

      expect(res.body.error.code).toBe('EVENT_TIME_CONFLICT');
      expect(res.body.error.details.conflictEventId).toBe(conflictEventId);
    });

    it('non-overlapping event 15:00-16:00 same assignee → 201', async () => {
      await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'After conflict',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(10, 15),
          endAt: daysFromNow(10, 16),
        })
        .expect(201);
    });

    it('overlapping event different assignee → 201 (no conflict)', async () => {
      const start = daysFromNow(10, 14).replace(':00:00.', ':15:00.');
      const end = daysFromNow(10, 15);

      await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'Agent same time',
          assigneeUserId: agentUserId,
          startAt: start,
          endAt: end,
        })
        .expect(201);
    });
  });

  // ─── LIST ───────────────────────────────────────────────────
  describe('List events', () => {
    it('list events within period → 200', async () => {
      const from = new Date().toISOString();
      const to = daysFromNow(30);

      const res = await request(app.getHttpServer())
        .get(`/api/planning/events?from=${from}&to=${to}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('period > 90 days → 400 PERIOD_TOO_LARGE', async () => {
      const from = new Date().toISOString();
      const to = daysFromNow(91);

      const res = await request(app.getHttpServer())
        .get(`/api/planning/events?from=${from}&to=${to}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(400);

      expect(res.body.error.code).toBe('PERIOD_TOO_LARGE');
    });

    it('agent sees only own events', async () => {
      const from = new Date().toISOString();
      const to = daysFromNow(30);

      const res = await request(app.getHttpServer())
        .get(`/api/planning/events?from=${from}&to=${to}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);

      for (const item of res.body.data.items) {
        expect(item.assigneeUserId).toBe(agentUserId);
      }
    });
  });

  // ─── GET ONE ────────────────────────────────────────────────
  describe('Get event by id', () => {
    let eventId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Detail test',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(15, 10),
          endAt: daysFromNow(15, 11),
          leadId,
        })
        .expect(201);
      eventId = res.body.data.id;
    });

    it('owner reads event → 200 with lead', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/planning/events/${eventId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBe(eventId);
      expect(res.body.data.lead).toBeDefined();
      expect(res.body.data.lead.fullName).toBe('Plan Lead');
    });

    it('agent reads owner event → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/planning/events/${eventId}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(404);
    });
  });

  // ─── CANCEL ─────────────────────────────────────────────────
  describe('Cancel event', () => {
    let eventId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'To cancel',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(20, 10),
          endAt: daysFromNow(20, 11),
          leadId,
        })
        .expect(201);
      eventId = res.body.data.id;
    });

    it('cancel event → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/planning/events/${eventId}/cancel`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ reason: 'Client indisponible' })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.canceled).toBe(true);
    });

    it('cancel again → 409 EVENT_ALREADY_CANCELED', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/planning/events/${eventId}/cancel`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ reason: 'Again' })
        .expect(409);

      expect(res.body.error.code).toBe('EVENT_ALREADY_CANCELED');
    });
  });

  // ─── COMPLETE ───────────────────────────────────────────────
  describe('Complete event', () => {
    let eventId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'To complete',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(21, 10),
          endAt: daysFromNow(21, 11),
          leadId,
        })
        .expect(201);
      eventId = res.body.data.id;
    });

    it('complete event → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/planning/events/${eventId}/complete`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ status: 'COMPLETED', resultNote: 'Très intéressé' })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.completed).toBe(true);
    });

    it('complete again → 409', async () => {
      await request(app.getHttpServer())
        .post(`/api/planning/events/${eventId}/complete`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ status: 'COMPLETED' })
        .expect(409);
    });
  });

  // ─── SOFT DELETE ────────────────────────────────────────────
  describe('Soft delete', () => {
    let eventId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'To delete',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(22, 10),
          endAt: daysFromNow(22, 11),
        })
        .expect(201);
      eventId = res.body.data.id;
    });

    it('manager deletes → 200', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/planning/events/${eventId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
    });

    it('deleted event → GET 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/planning/events/${eventId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(404);
    });

    it('agent cannot delete → 403', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'Agent try delete',
          assigneeUserId: agentUserId,
          startAt: daysFromNow(23, 10),
          endAt: daysFromNow(23, 11),
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/planning/events/${createRes.body.data.id}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(403);
    });
  });

  // ─── TIMELINE SYNC ──────────────────────────────────────────
  describe('Timeline sync', () => {
    it('create event with leadId → LeadActivity EVENT_SCHEDULED', async () => {
      const activitiesBefore = await prisma.leadActivity.findMany({
        where: { leadId, type: 'SYSTEM_EVENT' },
      });
      const countBefore = activitiesBefore.length;

      await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Timeline test visit',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(25, 10),
          endAt: daysFromNow(25, 11),
          leadId,
        })
        .expect(201);

      const activitiesAfter = await prisma.leadActivity.findMany({
        where: { leadId, type: 'SYSTEM_EVENT' },
        orderBy: { createdAt: 'desc' },
      });
      expect(activitiesAfter.length).toBeGreaterThan(countBefore);

      const latest = activitiesAfter[0];
      expect((latest.payloadJson as any).event).toBe('EVENT_SCHEDULED');
    });

    it('cancel event with leadId → LeadActivity EVENT_CANCELED', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Cancel timeline test',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(26, 10),
          endAt: daysFromNow(26, 11),
          leadId,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/planning/events/${createRes.body.data.id}/cancel`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ reason: 'Timeline cancel test' })
        .expect(200);

      const activities = await prisma.leadActivity.findMany({
        where: { leadId, type: 'SYSTEM_EVENT' },
        orderBy: { createdAt: 'desc' },
      });
      const latest = activities[0];
      expect((latest.payloadJson as any).event).toBe('EVENT_CANCELED');
    });
  });

  // ─── AUTO TASK ──────────────────────────────────────────────
  describe('AutoTask', () => {
    it('VISIT with autoTask enabled → task created + autoTaskId set', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Auto task visit',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(30, 14),
          endAt: daysFromNow(30, 15),
          leadId,
          autoTask: { enabled: true, remindMinutesBefore: 120 },
        })
        .expect(201);

      expect(res.body.data.autoTaskId).toBeDefined();

      // Verify task exists
      const task = await prisma.task.findUnique({
        where: { id: res.body.data.autoTaskId },
      });
      expect(task).toBeDefined();
      expect(task!.title).toContain('[Visite]');
      expect(task!.leadId).toBe(leadId);
    });

    it('MEETING with autoTask disabled → no task', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'MEETING',
          title: 'No auto task',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(31, 14),
          endAt: daysFromNow(31, 15),
        })
        .expect(201);

      expect(res.body.data.autoTaskId).toBeNull();
    });
  });

  // ─── TENANT ISOLATION ───────────────────────────────────────
  describe('Tenant isolation', () => {
    let eventIdA: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Tenant A event',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(35, 10),
          endAt: daysFromNow(35, 11),
        })
        .expect(201);
      eventIdA = res.body.data.id;
    });

    it('orgB GET orgA event → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/planning/events/${eventIdA}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB PATCH orgA event → 404', async () => {
      await request(app.getHttpServer())
        .patch(`/api/planning/events/${eventIdA}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ title: 'Hacked' })
        .expect(404);
    });

    it('orgB cancel orgA event → 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/planning/events/${eventIdA}/cancel`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ reason: 'Hacked' })
        .expect(404);
    });

    it('orgB delete orgA event → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/api/planning/events/${eventIdA}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB list does not show orgA events', async () => {
      const from = new Date().toISOString();
      const to = daysFromNow(60);

      const res = await request(app.getHttpServer())
        .get(`/api/planning/events?from=${from}&to=${to}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);

      const ids = res.body.data.items.map((e: any) => e.id);
      expect(ids).not.toContain(eventIdA);
    });
  });

  // ─── LEAD EVENTS ───────────────────────────────────────────
  describe('Lead events', () => {
    it('GET /api/planning/leads/:leadId/events → lists future events', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/planning/leads/${leadId}/events`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  // ─── RESCHEDULE (PATCH dates) ──────────────────────────────
  describe('Reschedule (PATCH dates)', () => {
    let eventId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/planning/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT',
          title: 'Reschedule test',
          assigneeUserId: ownerUserId,
          startAt: daysFromNow(40, 10),
          endAt: daysFromNow(40, 11),
          leadId,
          autoTask: { enabled: true },
        })
        .expect(201);
      eventId = res.body.data.id;
    });

    it('PATCH dates → 200 + EVENT_RESCHEDULED activity', async () => {
      await request(app.getHttpServer())
        .patch(`/api/planning/events/${eventId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          startAt: daysFromNow(41, 14),
          endAt: daysFromNow(41, 15),
        })
        .expect(200);

      const activities = await prisma.leadActivity.findMany({
        where: { leadId, type: 'SYSTEM_EVENT' },
        orderBy: { createdAt: 'desc' },
      });
      const latest = activities[0];
      expect((latest.payloadJson as any).event).toBe('EVENT_RESCHEDULED');
    });
  });
});

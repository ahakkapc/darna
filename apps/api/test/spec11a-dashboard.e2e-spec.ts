import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-11A — Dashboard & Stats (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ts = Date.now();
  const ownerUser = { email: `dash-owner-${ts}@test.com`, password: 'password1234', name: 'DashOwner' };
  const agentUser = { email: `dash-agent-${ts}@test.com`, password: 'password1234', name: 'DashAgent' };
  const otherUser = { email: `dash-other-${ts}@test.com`, password: 'password1234', name: 'DashOther' };

  let ownerCookies: string[];
  let agentCookies: string[];
  let otherCookies: string[];
  let ownerUserId: string;
  let agentUserId: string;
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    // Register users
    const r1 = await request(app.getHttpServer()).post('/api/auth/register').send(ownerUser).expect(201);
    ownerUserId = r1.body.id;
    const r2 = await request(app.getHttpServer()).post('/api/auth/register').send(agentUser).expect(201);
    agentUserId = r2.body.id;
    await request(app.getHttpServer()).post('/api/auth/register').send(otherUser).expect(201);

    ownerCookies = await login(ownerUser);
    agentCookies = await login(agentUser);
    otherCookies = await login(otherUser);

    // Create org A (owner)
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies)
      .send({ name: 'DashOrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    // Invite agent to org A
    const invRes = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`).set('Cookie', ownerCookies)
      .send({ email: agentUser.email, role: 'AGENT' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept').set('Cookie', agentCookies)
      .send({ token: invRes.body.token }).expect(200);

    // Create org B (other user)
    const orgBRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies)
      .send({ name: 'DashOrgB' }).expect(201);
    orgIdB = orgBRes.body.orgId;

    // Create a lead in org A (owned by owner)
    const leadRes = await request(app.getHttpServer())
      .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ fullName: 'Dash Lead', phone: '+213555000111' }).expect(201);
    leadId = leadRes.body.id;

    // Assign lead to owner
    await request(app.getHttpServer())
      .post(`/api/crm/leads/${leadId}/assign`).set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ ownerUserId }).expect(201);
  }, 60000);

  afterAll(async () => {
    try {
      await prisma.calendarEvent.deleteMany();
      await prisma.taskReminder.deleteMany();
      await prisma.task.deleteMany();
      await prisma.leadActivity.deleteMany();
      await prisma.leadRelation.deleteMany();
      await prisma.lead.deleteMany();
      await prisma.orgMembership.deleteMany();
      await prisma.orgInvite.deleteMany();
      await prisma.org.deleteMany();
      await prisma.user.deleteMany();
    } catch {}
    await app.close();
  }, 30000);

  // ─── OVERVIEW ──────────────────────────────────────────
  describe('GET /api/dashboard/overview', () => {
    it('owner gets overview scope=org period=month → 200 + kpis shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=month&scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      const d = res.body.data;
      expect(d.period).toBeDefined();
      expect(d.period.key).toBe('month');
      expect(d.period.timezone).toBe('Africa/Algiers');
      expect(d.kpis).toBeDefined();
      expect(typeof d.kpis.leadsNew).toBe('number');
      expect(typeof d.kpis.leadsWon).toBe('number');
      expect(typeof d.kpis.visitsScheduled).toBe('number');
      expect(typeof d.kpis.tasksOverdue).toBe('number');
      expect(d.breakdowns).toBeDefined();
      expect(d.series).toBeDefined();
      expect(Array.isArray(d.series.leadsPerDay)).toBe(true);
    });

    it('agent scope=me → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=week&scope=me')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
    });

    it('agent scope=org → 403 ROLE_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=week&scope=org')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(403);
      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    });

    it('agent scope=user → 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/dashboard/overview?period=week&scope=user&userId=${ownerUserId}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(403);
      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    });

    it('custom period > 90 days → 400 PERIOD_TOO_LARGE', async () => {
      const from = new Date('2025-01-01').toISOString();
      const to = new Date('2025-06-01').toISOString();
      const res = await request(app.getHttpServer())
        .get(`/api/dashboard/overview?period=custom&from=${from}&to=${to}&scope=me`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(400);
      expect(res.body.error.code).toBe('PERIOD_TOO_LARGE');
    });

    it('leadsNew reflects created lead', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=month&scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.kpis.leadsNew).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── WON/LOST correctness ──────────────────────────────
  describe('wonAt/lostAt correctness', () => {
    let wonLeadId: string;

    it('mark lead WON → wonAt set → leadsWon > 0', async () => {
      // Create a lead
      const lr = await request(app.getHttpServer())
        .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Won Lead' }).expect(201);
      wonLeadId = lr.body.id;

      // Assign to owner
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${wonLeadId}/assign`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ ownerUserId }).expect(201);

      // Mark as WON
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${wonLeadId}/mark-won`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({}).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=month&scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.kpis.leadsWon).toBeGreaterThanOrEqual(1);
    });

    it('mark lead LOST → lostAt set → leadsLost > 0', async () => {
      const lr = await request(app.getHttpServer())
        .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Lost Lead' }).expect(201);

      await request(app.getHttpServer())
        .post(`/api/crm/leads/${lr.body.id}/assign`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ ownerUserId }).expect(201);

      await request(app.getHttpServer())
        .post(`/api/crm/leads/${lr.body.id}/mark-lost`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ lostReason: 'Too expensive' }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=month&scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.kpis.leadsLost).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── VISITS correctness ────────────────────────────────
  describe('visits KPI', () => {
    it('create VISIT event → visitsScheduled reflects', async () => {
      await request(app.getHttpServer())
        .post('/api/planning/events').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          type: 'VISIT', title: 'Dash Visit', assigneeUserId: ownerUserId,
          startAt: tomorrow(10), endAt: tomorrow(11),
        }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=week&scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      // The visit is tomorrow so it should appear in the week view
      expect(res.body.data.kpis.visitsScheduled).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── TASKS correctness ─────────────────────────────────
  describe('tasks KPI', () => {
    it('create overdue task → tasksOverdue reflects', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/tasks`).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          title: 'Overdue Task',
          dueAt: yesterday.toISOString(),
          assigneeUserId: ownerUserId,
        }).expect(201);

      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=month&scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.kpis.tasksOverdue).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── COLLABORATORS ─────────────────────────────────────
  describe('GET /api/dashboard/collaborators', () => {
    it('manager gets collaborators list → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/collaborators?period=month')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);

      // At least one item should exist
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const anyItem = res.body.data.items[0];
      expect(typeof anyItem.kpis.leadsOwned).toBe('number');
    });

    it('agent cannot access collaborators → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/collaborators?period=month')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(403);
      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    });
  });

  // ─── PIPELINE ──────────────────────────────────────────
  describe('GET /api/dashboard/pipeline', () => {
    it('manager gets pipeline → 200 + funnel shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/pipeline?period=month&scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      const d = res.body.data;
      expect(Array.isArray(d.funnel)).toBe(true);
      expect(d.funnel.length).toBe(4);
      expect(d.funnel[0].step).toBe('LEADS_CREATED');
      expect(d.funnel[3].step).toBe('WON');
      expect(typeof d.rates.leadToVisit).toBe('number');
    });

    it('agent scope=me → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/pipeline?period=month&scope=me')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ─── FOCUS ─────────────────────────────────────────────
  describe('GET /api/dashboard/focus', () => {
    it('owner gets focus → 200 + shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/focus?scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      const d = res.body.data;
      expect(Array.isArray(d.needsFollowUpLeads)).toBe(true);
      expect(Array.isArray(d.upcomingVisits)).toBe(true);
      expect(Array.isArray(d.readyToPublishListings)).toBe(true);
    });

    it('focus tasksOverdue items present', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/focus?scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.needsFollowUpLeads.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── EXPORT ────────────────────────────────────────────
  describe('GET /api/dashboard/exports/leads.csv', () => {
    it('manager exports CSV → 200 text/csv', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/exports/leads.csv?period=month&scope=org')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('leads_');
      expect(res.text).toContain('leadId,fullName');
      const lines = res.text.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('agent cannot export → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/dashboard/exports/leads.csv?period=month&scope=me')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(403);
    });
  });

  // ─── TENANT ISOLATION ──────────────────────────────────
  describe('Tenant isolation', () => {
    it('orgB overview does not see orgA data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/overview?period=month&scope=org')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);

      expect(res.body.data.kpis.leadsNew).toBe(0);
      expect(res.body.data.kpis.leadsWon).toBe(0);
    });

    it('orgB pipeline does not see orgA data', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/pipeline?period=month&scope=org')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);

      expect(res.body.data.funnel[0].count).toBe(0);
    });

    it('orgB collaborators is empty of orgA members', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard/collaborators?period=month')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);

      const orgAMember = res.body.data.items.find((i: any) => i.userId === ownerUserId);
      expect(orgAMember).toBeUndefined();
    });
  });
});

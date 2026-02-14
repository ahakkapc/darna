import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

const BASE = '/api/crm/leads';

describe('SPEC-06 — CRM Core Leads v2 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerUser = { email: 'owner06@test.com', password: 'password1234', name: 'Owner06' };
  const managerUser = { email: 'manager06@test.com', password: 'password1234', name: 'Manager06' };
  const agentUser = { email: 'agent06@test.com', password: 'password1234', name: 'Agent06' };
  const viewerUser = { email: 'viewer06@test.com', password: 'password1234', name: 'Viewer06' };
  const otherUser = { email: 'other06@test.com', password: 'password1234', name: 'Other06' };

  let ownerCookies: string[];
  let managerCookies: string[];
  let agentCookies: string[];
  let viewerCookies: string[];
  let otherCookies: string[];
  let ownerUserId: string;
  let managerUserId: string;
  let agentUserId: string;
  let viewerUserId: string;
  let otherUserId: string;

  let orgId: string;
  let orgIdB: string;

  async function reg(u: { email: string; password: string; name: string }) {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(u).expect(201);
    return res.body.id as string;
  }

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

    // Clean
    await prisma.taskReminder.deleteMany();
    await prisma.task.deleteMany();
    await prisma.notificationDispatch.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.leadActivity.deleteMany();
    await prisma.leadRelation.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.orgInvite.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.orgMembership.deleteMany();
    await prisma.org.deleteMany();
    await prisma.user.deleteMany();

    // Register
    ownerUserId = await reg(ownerUser);
    managerUserId = await reg(managerUser);
    agentUserId = await reg(agentUser);
    viewerUserId = await reg(viewerUser);
    otherUserId = await reg(otherUser);

    // Login
    ownerCookies = await login(ownerUser);
    managerCookies = await login(managerUser);
    agentCookies = await login(agentUser);
    viewerCookies = await login(viewerUser);
    otherCookies = await login(otherUser);

    // Create org A
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies).send({ name: 'Org06A' }).expect(201);
    orgId = orgRes.body.orgId;

    // Invite manager, agent, viewer
    const invM = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`).set('Cookie', ownerCookies)
      .send({ email: managerUser.email, role: 'MANAGER' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept').set('Cookie', managerCookies)
      .send({ token: invM.body.token }).expect(200);

    const invA = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`).set('Cookie', ownerCookies)
      .send({ email: agentUser.email, role: 'AGENT' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept').set('Cookie', agentCookies)
      .send({ token: invA.body.token }).expect(200);

    const invV = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`).set('Cookie', ownerCookies)
      .send({ email: viewerUser.email, role: 'VIEWER' }).expect(201);
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept').set('Cookie', viewerCookies)
      .send({ token: invV.body.token }).expect(200);

    // Create org B
    const orgBRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies).send({ name: 'Org06B' }).expect(201);
    orgIdB = orgBRes.body.orgId;
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.taskReminder.deleteMany();
      await prisma.task.deleteMany();
      await prisma.notificationDispatch.deleteMany();
      await prisma.notification.deleteMany();
      await prisma.leadActivity.deleteMany();
      await prisma.leadRelation.deleteMany();
      await prisma.lead.deleteMany();
      await prisma.orgInvite.deleteMany();
      await prisma.refreshToken.deleteMany();
      await prisma.orgMembership.deleteMany();
      await prisma.org.deleteMany();
      await prisma.user.deleteMany();
    } catch { /* best-effort */ }
    await app.close();
  }, 30000);

  // ─── CRUD ──────────────────────────────────────────────────────
  describe('CRUD', () => {
    let leadId: string;

    it('POST create lead with all fields → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(BASE)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({
          fullName: 'Ahmed Ben Ali',
          phone: '+213555123456',
          email: 'ahmed@test.com',
          type: 'BUYER',
          priority: 'HIGH',
          budgetMin: 5000000,
          budgetMax: 10000000,
          wilaya: 'Alger',
          commune: 'Bab El Oued',
          propertyType: 'F3',
          surfaceMin: 80,
          notes: 'Interested in F3 near metro',
          tags: ['vip', 'urgent'],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.fullName).toBe('Ahmed Ben Ali');
      expect(res.body.type).toBe('BUYER');
      expect(res.body.priority).toBe('HIGH');
      expect(res.body.status).toBe('NEW');
      expect(res.body.createdByUserId).toBe(ownerUserId);
      expect(res.body.organizationId).toBe(orgId);
      leadId = res.body.id;
    });

    it('GET single lead → 200 with full data', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/${leadId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.fullName).toBe('Ahmed Ben Ali');
      expect(res.body.budgetMin).toBe(5000000);
      expect(res.body.tagsJson).toEqual(['vip', 'urgent']);
    });

    it('PATCH update lead → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${BASE}/${leadId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ priority: 'LOW', notes: 'Updated notes' })
        .expect(200);

      expect(res.body.priority).toBe('LOW');
      expect(res.body.notes).toBe('Updated notes');
    });

    it('POST create lead with minimal fields → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(BASE)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ fullName: 'Minimal Lead' })
        .expect(201);

      expect(res.body.type).toBe('BUYER');
      expect(res.body.priority).toBe('MEDIUM');
      expect(res.body.sourceType).toBe('MANUAL');
    });

    it('POST create lead with empty fullName → 400', async () => {
      await request(app.getHttpServer())
        .post(BASE)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ fullName: '' })
        .expect(400);
    });
  });

  // ─── CURSOR PAGINATION ────────────────────────────────────────
  describe('Cursor pagination', () => {
    const leadIds: string[] = [];

    beforeAll(async () => {
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .post(BASE)
          .set('Cookie', ownerCookies)
          .set('x-org-id', orgId)
          .send({ fullName: `Paginate Lead ${i}` })
          .expect(201);
        leadIds.push(res.body.id);
      }
    });

    it('list returns paginated structure', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?limit=3`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.items.length).toBeLessThanOrEqual(3);
      expect(res.body.page).toBeDefined();
      expect(res.body.page.limit).toBe(3);
      expect(res.body.page).toHaveProperty('nextCursor');
      expect(res.body.page).toHaveProperty('hasMore');
    });

    it('cursor walk collects all items without overlap', async () => {
      const allIds: string[] = [];
      let cursor: string | null = null;

      for (let page = 0; page < 10; page++) {
        const url: string = cursor ? `${BASE}?limit=3&cursor=${cursor}` : `${BASE}?limit=3`;
        const res: request.Response = await request(app.getHttpServer())
          .get(url)
          .set('Cookie', ownerCookies)
          .set('x-org-id', orgId)
          .expect(200);

        for (const item of res.body.items) {
          expect(allIds).not.toContain(item.id);
          allIds.push(item.id);
        }

        if (!res.body.page.hasMore) break;
        cursor = res.body.page.nextCursor;
      }

      // Should have collected all leads created so far (at least 7)
      expect(allIds.length).toBeGreaterThanOrEqual(7);
    });

    it('filters: status', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?status=NEW`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      for (const item of res.body.items) {
        expect(item.status).toBe('NEW');
      }
    });

    it('filters: type', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?type=BUYER`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      for (const item of res.body.items) {
        expect(item.type).toBe('BUYER');
      }
    });
  });

  // ─── ASSIGN ──────────────────────────────────────────────────
  describe('Assign', () => {
    let leadId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Assign Test Lead' }).expect(201);
      leadId = res.body.id;
    });

    it('OWNER can assign lead to agent → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/${leadId}/assign`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ ownerUserId: agentUserId })
        .expect(201);

      expect(res.body.ownerUserId).toBe(agentUserId);
    });

    it('AGENT cannot assign → 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/${leadId}/assign`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ ownerUserId: ownerUserId })
        .expect(403);

      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    });

    it('VIEWER cannot assign → 403', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/${leadId}/assign`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .send({ ownerUserId: ownerUserId })
        .expect(403);
    });

    it('assign to non-member → 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/${leadId}/assign`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ ownerUserId: otherUserId })
        .expect(400);

      expect(res.body.error.code).toBe('OWNER_NOT_MEMBER');
    });

    it('assign creates OWNER_ASSIGNED system event', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const ev = res.body.data.items.find(
        (a: any) => a.type === 'SYSTEM_EVENT' && a.payload?.event === 'OWNER_ASSIGNED',
      );
      expect(ev).toBeDefined();
    });
  });

  // ─── MARK LOST / WON ────────────────────────────────────────
  describe('Mark Lost / Won', () => {
    let lostLeadId: string;
    let wonLeadId: string;

    beforeAll(async () => {
      const r1 = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Lost Lead' }).expect(201);
      lostLeadId = r1.body.id;

      const r2 = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Won Lead' }).expect(201);
      wonLeadId = r2.body.id;
    });

    it('mark-lost → status=LOST + lostReason set', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/${lostLeadId}/mark-lost`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ lostReason: 'Budget too low' })
        .expect(201);

      expect(res.body.status).toBe('LOST');
      expect(res.body.lostReason).toBe('Budget too low');
    });

    it('mark-won → status=WON + wonNote set', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/${wonLeadId}/mark-won`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ wonNote: 'Signed contract' })
        .expect(201);

      expect(res.body.status).toBe('WON');
      expect(res.body.wonNote).toBe('Signed contract');
    });

    it('mark-lost creates MARKED_LOST system event', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${lostLeadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const ev = res.body.data.items.find(
        (a: any) => a.type === 'SYSTEM_EVENT' && a.payload?.event === 'MARKED_LOST',
      );
      expect(ev).toBeDefined();
    });

    it('VIEWER cannot mark-lost → 403', async () => {
      const tmpRes = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Viewer Lost Test' }).expect(201);

      await request(app.getHttpServer())
        .post(`${BASE}/${tmpRes.body.id}/mark-lost`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .send({})
        .expect(403);
    });
  });

  // ─── SOFT DELETE ──────────────────────────────────────────────
  describe('Soft delete', () => {
    let delLeadId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'To Delete Lead' }).expect(201);
      delLeadId = res.body.id;
    });

    it('DELETE → soft-deletes (recordStatus=DELETED)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`${BASE}/${delLeadId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.deleted).toBe(true);
    });

    it('deleted lead hidden from list by default', async () => {
      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const found = res.body.items.find((l: any) => l.id === delLeadId);
      expect(found).toBeUndefined();
    });

    it('deleted lead visible with includeDeleted=true (OWNER)', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?includeDeleted=true`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const found = res.body.items.find((l: any) => l.id === delLeadId);
      expect(found).toBeDefined();
      expect(found.recordStatus).toBe('DELETED');
    });

    it('GET deleted lead → 404', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/${delLeadId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(404);
    });

    it('VIEWER cannot delete → 403', async () => {
      const tmpRes = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Viewer Del Test' }).expect(201);

      await request(app.getHttpServer())
        .delete(`${BASE}/${tmpRes.body.id}`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .expect(403);
    });
  });

  // ─── RBAC VISIBILITY ──────────────────────────────────────────
  describe('RBAC visibility', () => {
    let unassignedLeadId: string;
    let agentLeadId: string;
    let otherAgentLeadId: string;

    beforeAll(async () => {
      // Unassigned lead (pool)
      const r1 = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Pool Lead' }).expect(201);
      unassignedLeadId = r1.body.id;

      // Lead assigned to agent
      const r2 = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Agent Lead' }).expect(201);
      agentLeadId = r2.body.id;
      await request(app.getHttpServer())
        .post(`${BASE}/${agentLeadId}/assign`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ ownerUserId: agentUserId }).expect(201);

      // Lead assigned to manager (not agent)
      const r3 = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Manager Lead' }).expect(201);
      otherAgentLeadId = r3.body.id;
      await request(app.getHttpServer())
        .post(`${BASE}/${otherAgentLeadId}/assign`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ ownerUserId: managerUserId }).expect(201);
    });

    it('OWNER sees all leads', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?limit=100`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      const ids = res.body.items.map((l: any) => l.id);
      expect(ids).toContain(unassignedLeadId);
      expect(ids).toContain(agentLeadId);
      expect(ids).toContain(otherAgentLeadId);
    });

    it('AGENT sees own + pool, not others assigned leads', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?limit=100`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);

      const ids = res.body.items.map((l: any) => l.id);
      expect(ids).toContain(unassignedLeadId);
      expect(ids).toContain(agentLeadId);
      expect(ids).not.toContain(otherAgentLeadId);
    });

    it('AGENT GET lead assigned to someone else → 404', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/${otherAgentLeadId}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(404);
    });

    it('VIEWER sees own + pool, not others assigned leads', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}?limit=100`)
        .set('Cookie', viewerCookies).set('x-org-id', orgId)
        .expect(200);

      const ids = res.body.items.map((l: any) => l.id);
      expect(ids).toContain(unassignedLeadId);
      expect(ids).not.toContain(otherAgentLeadId);
    });
  });

  // ─── RBAC FIELD-LEVEL PERMISSIONS ─────────────────────────────
  describe('RBAC field-level permissions', () => {
    let testLeadId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Field Perm Lead' }).expect(201);
      testLeadId = res.body.id;
    });

    it('VIEWER can update notes → 200', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/${testLeadId}`)
        .set('Cookie', viewerCookies).set('x-org-id', orgId)
        .send({ notes: 'Viewer updated notes' })
        .expect(200);
    });

    it('VIEWER cannot update fullName → 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`${BASE}/${testLeadId}`)
        .set('Cookie', viewerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Hacked Name' })
        .expect(403);

      expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    });

    it('AGENT can update status → 200', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/${testLeadId}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ status: 'TO_CONTACT' })
        .expect(200);
    });

    it('AGENT cannot update fullName → 403', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/${testLeadId}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ fullName: 'Hacked' })
        .expect(403);
    });

    it('OWNER can update any field → 200', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/${testLeadId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Renamed by Owner', type: 'SELLER' })
        .expect(200);
    });
  });

  // ─── RELATIONS ────────────────────────────────────────────────
  describe('Relations', () => {
    let testLeadId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Relation Lead' }).expect(201);
      testLeadId = res.body.id;
    });

    it('POST create relation → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`${BASE}/${testLeadId}/relations`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          relationType: 'LISTING',
          targetId: '00000000-0000-0000-0000-000000000001',
          label: 'Apartment F3',
        })
        .expect(201);

      expect(res.body.relationType).toBe('LISTING');
      expect(res.body.targetId).toBe('00000000-0000-0000-0000-000000000001');
      expect(res.body.label).toBe('Apartment F3');
    });

    it('GET relations → returns created relation', async () => {
      const res = await request(app.getHttpServer())
        .get(`${BASE}/${testLeadId}/relations`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].relationType).toBe('LISTING');
    });

    it('duplicate relation → 409', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/${testLeadId}/relations`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          relationType: 'LISTING',
          targetId: '00000000-0000-0000-0000-000000000001',
        })
        .expect(409);
    });
  });

  // ─── TENANT ISOLATION ─────────────────────────────────────────
  describe('Tenant isolation', () => {
    let orgALeadId: string;
    let orgBLeadId: string;

    beforeAll(async () => {
      const rA = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Isolation Lead A' }).expect(201);
      orgALeadId = rA.body.id;

      const rB = await request(app.getHttpServer())
        .post(BASE).set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ fullName: 'Isolation Lead B' }).expect(201);
      orgBLeadId = rB.body.id;
    });

    it('orgB cannot list orgA leads', async () => {
      const res = await request(app.getHttpServer())
        .get(BASE)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);

      const ids = res.body.items.map((l: any) => l.id);
      expect(ids).not.toContain(orgALeadId);
    });

    it('orgB cannot read orgA lead → 404', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/${orgALeadId}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot update orgA lead → 404', async () => {
      await request(app.getHttpServer())
        .patch(`${BASE}/${orgALeadId}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ fullName: 'Hacked' })
        .expect(404);
    });

    it('orgB cannot delete orgA lead → 404', async () => {
      await request(app.getHttpServer())
        .delete(`${BASE}/${orgALeadId}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgA cannot read orgB lead → 404', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}/${orgBLeadId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(404);
    });
  });

  // ─── HOOKS: SYSTEM EVENTS + NOTIFICATIONS ─────────────────────
  describe('Hooks: system events + notifications', () => {
    it('create lead fires LEAD_CREATED system event', async () => {
      const createRes = await request(app.getHttpServer())
        .post(BASE).set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ fullName: 'Hook Test Lead' }).expect(201);

      const actRes = await request(app.getHttpServer())
        .get(`/api/crm/leads/${createRes.body.id}/activities`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      const ev = actRes.body.data.items.find(
        (a: any) => a.type === 'SYSTEM_EVENT' && a.payload?.event === 'LEAD_CREATED',
      );
      expect(ev).toBeDefined();
    });

    it('create lead by agent fires lead.new notification to owner', async () => {
      // Wait briefly for async notification
      await new Promise((r) => setTimeout(r, 500));

      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const leadNotif = (res.body.data?.items ?? res.body.items ?? []).find(
        (n: any) => n.templateKey === 'lead.new',
      );
      expect(leadNotif).toBeDefined();
    });

    it('assign fires lead.assigned notification to assignee', async () => {
      const createRes = await request(app.getHttpServer())
        .post(BASE).set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Assign Notif Lead' }).expect(201);

      await request(app.getHttpServer())
        .post(`${BASE}/${createRes.body.id}/assign`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ ownerUserId: agentUserId })
        .expect(201);

      // Wait briefly for async notification
      await new Promise((r) => setTimeout(r, 500));

      const res = await request(app.getHttpServer())
        .get('/api/notifications')
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const assignNotif = (res.body.data?.items ?? res.body.items ?? []).find(
        (n: any) => n.templateKey === 'lead.assigned',
      );
      expect(assignNotif).toBeDefined();
    });
  });
});

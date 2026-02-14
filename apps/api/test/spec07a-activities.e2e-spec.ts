import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-07A — CRM Timeline Activities (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerUser = { email: 'owner07a@test.com', password: 'password1234', name: 'Owner07A' };
  const agentUser = { email: 'agent07a@test.com', password: 'password1234', name: 'Agent07A' };
  const viewerUser = { email: 'viewer07a@test.com', password: 'password1234', name: 'Viewer07A' };
  const otherUser = { email: 'other07a@test.com', password: 'password1234', name: 'Other07A' };

  let ownerCookies: string[];
  let agentCookies: string[];
  let viewerCookies: string[];
  let otherCookies: string[];
  let ownerUserId: string;
  let agentUserId: string;
  let viewerUserId: string;
  let otherUserId: string;

  let orgId: string;
  let orgIdB: string;
  let leadId: string;
  let leadIdB: string;

  async function register(u: { email: string; password: string; name: string }) {
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

    // Clean slate
    await prisma.taskReminder.deleteMany();
    await prisma.task.deleteMany();
    await prisma.leadActivity.deleteMany();
    await prisma.leadRelation.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.orgInvite.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.orgMembership.deleteMany();
    await prisma.org.deleteMany();
    await prisma.user.deleteMany();

    // Register users
    ownerUserId = await register(ownerUser);
    agentUserId = await register(agentUser);
    viewerUserId = await register(viewerUser);
    otherUserId = await register(otherUser);

    // Login
    ownerCookies = await login(ownerUser);
    agentCookies = await login(agentUser);
    viewerCookies = await login(viewerUser);
    otherCookies = await login(otherUser);

    // Create org A (owner = ownerUser)
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs')
      .set('Cookie', ownerCookies)
      .send({ name: 'OrgA-07A' })
      .expect(201);
    orgId = orgRes.body.orgId;

    // Invite agent + viewer to org A
    const invAgent = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`)
      .set('Cookie', ownerCookies)
      .send({ email: agentUser.email, role: 'AGENT' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept')
      .set('Cookie', agentCookies)
      .send({ token: invAgent.body.token })
      .expect(200);

    const invViewer = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`)
      .set('Cookie', ownerCookies)
      .send({ email: viewerUser.email, role: 'VIEWER' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept')
      .set('Cookie', viewerCookies)
      .send({ token: invViewer.body.token })
      .expect(200);

    // Create org B (other user)
    const orgBRes = await request(app.getHttpServer())
      .post('/api/orgs')
      .set('Cookie', otherCookies)
      .send({ name: 'OrgB-07A' })
      .expect(201);
    orgIdB = orgBRes.body.orgId;

    // Create lead in org A
    const leadRes = await request(app.getHttpServer())
      .post('/api/crm/leads')
      .set('Cookie', ownerCookies)
      .set('x-org-id', orgId)
      .send({ fullName: 'Lead Alpha' })
      .expect(201);
    leadId = leadRes.body.id;

    // Create lead in org B
    const leadBRes = await request(app.getHttpServer())
      .post('/api/crm/leads')
      .set('Cookie', otherCookies)
      .set('x-org-id', orgIdB)
      .send({ fullName: 'Lead Beta' })
      .expect(201);
    leadIdB = leadBRes.body.id;
  }, 30000);

  afterAll(async () => {
    try {
      await prisma.taskReminder.deleteMany();
      await prisma.task.deleteMany();
      await prisma.leadActivity.deleteMany();
      await prisma.leadRelation.deleteMany();
      await prisma.lead.deleteMany();
      await prisma.orgInvite.deleteMany();
      await prisma.refreshToken.deleteMany();
      await prisma.orgMembership.deleteMany();
      await prisma.org.deleteMany();
      await prisma.user.deleteMany();
    } catch { /* cleanup best-effort */ }
    await app.close();
  }, 30000);

  // ─── SYSTEM EVENTS ──────────────────────────────────────────────
  describe('System events', () => {
    it('create lead → timeline contains LEAD_CREATED system event', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const items = res.body.data.items;
      const created = items.find(
        (a: any) => a.type === 'SYSTEM_EVENT' && a.payload?.event === 'LEAD_CREATED',
      );
      expect(created).toBeDefined();
      expect(created.payload.to.status).toBe('NEW');
    });

    it('change status → timeline contains STATUS_CHANGED', async () => {
      await request(app.getHttpServer())
        .patch(`/api/crm/leads/${leadId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ status: 'TO_CONTACT' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const ev = res.body.data.items.find(
        (a: any) => a.type === 'SYSTEM_EVENT' && a.payload?.event === 'STATUS_CHANGED',
      );
      expect(ev).toBeDefined();
      expect(ev.payload.from.status).toBe('NEW');
      expect(ev.payload.to.status).toBe('TO_CONTACT');
    });

    it('assign owner → timeline contains OWNER_ASSIGNED', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/assign`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ ownerUserId: agentUserId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const ev = res.body.data.items.find(
        (a: any) => a.type === 'SYSTEM_EVENT' && a.payload?.event === 'OWNER_ASSIGNED',
      );
      expect(ev).toBeDefined();
      expect(ev.payload.to.ownerUserId).toBe(agentUserId);
    });

    it('mark WON → timeline contains MARKED_WON', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/mark-won`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({})
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const ev = res.body.data.items.find(
        (a: any) => a.type === 'SYSTEM_EVENT' && a.payload?.event === 'MARKED_WON',
      );
      expect(ev).toBeDefined();
    });
  });

  // ─── MANUAL ACTIVITIES CRUD ─────────────────────────────────────
  describe('Manual activities', () => {
    let noteId: string;
    let callId: string;

    it('POST create NOTE → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ type: 'NOTE', body: 'First contact note' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBeDefined();
      noteId = res.body.data.id;
    });

    it('POST create CALL with valid payload → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({
          type: 'CALL',
          direction: 'OUTBOUND',
          body: 'Called lead',
          payload: { phone: '+21312345678', outcome: 'ANSWERED', durationSec: 60 },
        })
        .expect(201);

      callId = res.body.data.id;
    });

    it('POST create SYSTEM_EVENT from API → 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ type: 'SYSTEM_EVENT', body: 'hack' })
        .expect(400);
    });

    it('POST create CALL without direction → 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ type: 'CALL', body: 'no dir', payload: { phone: '+213', outcome: 'ANSWERED' } })
        .expect(400);
    });

    it('POST create NOTE without body → 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ type: 'NOTE' })
        .expect(400);
    });

    it('PATCH update note body → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/crm/activities/${noteId}`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ body: 'Updated note body' })
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.updated).toBe(true);
    });

    it('GET list activities returns items with cursor pagination', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities?limit=2`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeLessThanOrEqual(2);
      expect(res.body.data.page.limit).toBe(2);
      expect(res.body.data.page).toHaveProperty('nextCursor');
      expect(res.body.data.page).toHaveProperty('hasMore');
    });

    it('GET list with type filter', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities?type=NOTE`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      for (const item of res.body.data.items) {
        expect(item.type).toBe('NOTE');
      }
    });

    it('cursor pagination walks full timeline', async () => {
      const page1 = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities?limit=2`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      if (page1.body.data.page.hasMore) {
        const page2 = await request(app.getHttpServer())
          .get(`/api/crm/leads/${leadId}/activities?limit=2&cursor=${page1.body.data.page.nextCursor}`)
          .set('Cookie', ownerCookies)
          .set('x-org-id', orgId)
          .expect(200);

        expect(page2.body.data.items.length).toBeGreaterThanOrEqual(1);
        const ids1 = page1.body.data.items.map((i: any) => i.id);
        const ids2 = page2.body.data.items.map((i: any) => i.id);
        const overlap = ids1.filter((id: string) => ids2.includes(id));
        expect(overlap.length).toBe(0);
      }
    });
  });

  // ─── SOFT DELETE ────────────────────────────────────────────────
  describe('Soft delete', () => {
    let deletableNoteId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ type: 'NOTE', body: 'To be deleted' })
        .expect(201);
      deletableNoteId = res.body.data.id;
    });

    it('DELETE activity → recordStatus=DELETED', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/crm/activities/${deletableNoteId}`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.data.deleted).toBe(true);
    });

    it('list without includeDeleted → does not include deleted activity', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const found = res.body.data.items.find((a: any) => a.id === deletableNoteId);
      expect(found).toBeUndefined();
    });

    it('manager with includeDeleted=true → sees deleted activity', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities?includeDeleted=true`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const found = res.body.data.items.find((a: any) => a.id === deletableNoteId);
      expect(found).toBeDefined();
      expect(found.recordStatus).toBe('DELETED');
    });

    it('delete SYSTEM_EVENT → 403 ACTIVITY_DELETE_FORBIDDEN', async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const sysEvent = listRes.body.data.items.find((a: any) => a.type === 'SYSTEM_EVENT');
      expect(sysEvent).toBeDefined();

      const res = await request(app.getHttpServer())
        .delete(`/api/crm/activities/${sysEvent.id}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(403);

      expect(res.body.error.code).toBe('ACTIVITY_DELETE_FORBIDDEN');
    });
  });

  // ─── RBAC ──────────────────────────────────────────────────────
  describe('RBAC', () => {
    let agentNoteId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ type: 'NOTE', body: 'Agent private note' })
        .expect(201);
      agentNoteId = res.body.data.id;
    });

    it('viewer can create NOTE', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .send({ type: 'NOTE', body: 'Viewer note' })
        .expect(201);
    });

    it('viewer cannot create VISIT → 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .send({ type: 'VISIT' })
        .expect(403);
    });

    it('viewer cannot delete any activity → 403', async () => {
      await request(app.getHttpServer())
        .delete(`/api/crm/activities/${agentNoteId}`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .expect(403);
    });

    it('agent cannot update another agent note → 404', async () => {
      // Create note by owner
      const ownerNote = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ type: 'NOTE', body: 'Owner note' })
        .expect(201);

      // Agent tries to update owner's note
      await request(app.getHttpServer())
        .patch(`/api/crm/activities/${ownerNote.body.data.id}`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ body: 'hacked' })
        .expect(404);
    });

    it('owner can delete agent note', async () => {
      await request(app.getHttpServer())
        .delete(`/api/crm/activities/${agentNoteId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);
    });
  });

  // ─── TENANT ISOLATION ──────────────────────────────────────────
  describe('Tenant isolation', () => {
    it('orgB cannot list activities of orgA lead → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot create activity on orgA lead → 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .send({ type: 'NOTE', body: 'Cross-tenant attack' })
        .expect(404);
    });

    it('orgB cannot delete activity from orgA → 404', async () => {
      // Get an activity from orgA
      const listRes = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/activities`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      const anyActivity = listRes.body.data.items[0];
      expect(anyActivity).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/api/crm/activities/${anyActivity.id}`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .expect(404);
    });
  });
});

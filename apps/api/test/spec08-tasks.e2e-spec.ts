import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-08 — CRM Tasks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const ownerUser = { email: 'task-owner08@test.com', password: 'password1234', name: 'TaskOwner08' };
  const managerUser = { email: 'task-mgr08@test.com', password: 'password1234', name: 'TaskMgr08' };
  const agentUser = { email: 'task-agent08@test.com', password: 'password1234', name: 'TaskAgent08' };
  const viewerUser = { email: 'task-viewer08@test.com', password: 'password1234', name: 'TaskViewer08' };
  const otherUser = { email: 'task-other08@test.com', password: 'password1234', name: 'TaskOther08' };

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
  let leadIdA: string;
  let leadIdB: string;

  async function reg(u: { email: string; password: string; name: string }): Promise<string> {
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
    await prisma.notificationDispatch.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.notificationPreference.deleteMany();
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

    // Create org A (owner)
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies).send({ name: 'TaskOrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    // Invite manager, agent, viewer into org A
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

    // Create org B (other user)
    const orgBRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies).send({ name: 'TaskOrgB' }).expect(201);
    orgIdB = orgBRes.body.orgId;

    // Create a lead in org A (owner)
    const leadRes = await request(app.getHttpServer())
      .post('/api/crm/leads')
      .set('Cookie', ownerCookies)
      .set('x-org-id', orgId)
      .send({ fullName: 'LeadA Test', phone: '+213550000001' })
      .expect(201);
    leadIdA = leadRes.body.id;

    // Create a lead in org B (other)
    const leadBRes = await request(app.getHttpServer())
      .post('/api/crm/leads')
      .set('Cookie', otherCookies)
      .set('x-org-id', orgIdB)
      .send({ fullName: 'LeadB Test', phone: '+213550000002' })
      .expect(201);
    leadIdB = leadBRes.body.id;
  }, 60000);

  afterAll(async () => {
    try {
      await prisma.taskReminder.deleteMany();
      await prisma.task.deleteMany();
      await prisma.notificationDispatch.deleteMany();
      await prisma.notification.deleteMany();
      await prisma.notificationPreference.deleteMany();
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

  // ─── CREATE TASK ────────────────────────────────────────────────
  describe('Create Task', () => {
    it('owner creates task on lead → 201 + returns id', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Relancer le client', priority: 'HIGH' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBeDefined();
    });

    it('creates task with dueAt → reminders created', async () => {
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Task with reminders', dueAt: futureDate })
        .expect(201);

      const taskId: string = res.body.data.id;
      const detail = await request(app.getHttpServer())
        .get(`/api/crm/tasks/${taskId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(detail.body.reminders).toBeDefined();
      expect(detail.body.reminders.length).toBe(2);
    });

    it('creates task with dueAt=null → no reminders', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Task no due' })
        .expect(201);

      const taskId: string = res.body.data.id;
      const detail = await request(app.getHttpServer())
        .get(`/api/crm/tasks/${taskId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(detail.body.reminders.length).toBe(0);
    });

    it('title validation: too short → 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'A' })
        .expect(400);
    });

    it('agent creates task assigned to self → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Agent self task', assigneeUserId: agentUserId })
        .expect(201);

      expect(res.body.ok).toBe(true);
    });

    it('tags validation: invalid tag → 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Bad tags', tags: ['INVALID TAG!'] })
        .expect(400);
    });
  });

  // ─── RBAC ASSIGN ────────────────────────────────────────────────
  describe('RBAC Assign', () => {
    let taskForAssign: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Task for assign test', assigneeUserId: ownerUserId })
        .expect(201);
      taskForAssign = res.body.data.id;
    });

    it('manager assigns to anyone → 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/tasks/${taskForAssign}/assign`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgId)
        .send({ assigneeUserId: agentUserId })
        .expect(200);
    });

    it('agent assigns to self → 200', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/tasks/${taskForAssign}/assign`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ assigneeUserId: agentUserId })
        .expect(200);
    });

    it('agent assigns to another user → 403 TASK_ASSIGN_FORBIDDEN', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/tasks/${taskForAssign}/assign`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ assigneeUserId: managerUserId })
        .expect(403);

      expect(res.body.error.code).toBe('TASK_ASSIGN_FORBIDDEN');
    });

    it('viewer cannot reassign → 403 TASK_ASSIGN_FORBIDDEN', async () => {
      // First make viewer the assignee so they can see the task
      await request(app.getHttpServer())
        .post(`/api/crm/tasks/${taskForAssign}/assign`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgId)
        .send({ assigneeUserId: viewerUserId })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post(`/api/crm/tasks/${taskForAssign}/assign`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .send({ assigneeUserId: agentUserId })
        .expect(403);

      expect(res.body.error.code).toBe('TASK_ASSIGN_FORBIDDEN');
    });
  });

  // ─── GET / LIST ─────────────────────────────────────────────────
  describe('List & Read', () => {
    let taskId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'List test task', assigneeUserId: ownerUserId })
        .expect(201);
      taskId = res.body.data.id;
    });

    it('GET /api/crm/tasks → returns items + pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/tasks')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.page).toBeDefined();
      expect(res.body.page.limit).toBe(20);
    });

    it('GET /api/crm/tasks/:id → full task detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/tasks/${taskId}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.id).toBe(taskId);
      expect(res.body.title).toBe('List test task');
      expect(res.body.reminders).toBeDefined();
    });

    it('scope=team for manager → returns all tasks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/tasks?scope=team')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('scope=team for agent → 403', async () => {
      await request(app.getHttpServer())
        .get('/api/crm/tasks?scope=team')
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .expect(403);
    });

    it('filter by status → only matching tasks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/tasks?scope=team&status=OPEN')
        .set('Cookie', managerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      for (const item of res.body.items) {
        expect(item.status).toBe('OPEN');
      }
    });

    it('scope=lead:<id> → tasks for that lead', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/tasks?scope=lead:${leadIdA}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      for (const item of res.body.items) {
        expect(item.leadId).toBe(leadIdA);
      }
    });
  });

  // ─── PATCH ──────────────────────────────────────────────────────
  describe('Update Task', () => {
    let taskId: string;

    beforeAll(async () => {
      const futureDate = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Updatable task', assigneeUserId: agentUserId, dueAt: futureDate })
        .expect(201);
      taskId = res.body.data.id;
    });

    it('manager updates any field → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/crm/tasks/${taskId}`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Updated title', priority: 'URGENT' })
        .expect(200);

      expect(res.body.title).toBe('Updated title');
      expect(res.body.priority).toBe('URGENT');
    });

    it('agent (assignee) updates status → 200', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/crm/tasks/${taskId}`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
    });

    it('viewer (non-assignee) cannot update → 404', async () => {
      await request(app.getHttpServer())
        .patch(`/api/crm/tasks/${taskId}`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .send({ status: 'DONE' })
        .expect(404);
    });

    it('status DONE → completedAt set + reminders canceled', async () => {
      // Create a fresh task with future dueAt
      const futureDate = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
      const createRes = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Done cancels reminders', dueAt: futureDate, assigneeUserId: ownerUserId })
        .expect(201);
      const tid: string = createRes.body.data.id;

      // Verify reminders exist
      const before = await request(app.getHttpServer())
        .get(`/api/crm/tasks/${tid}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);
      expect(before.body.reminders.length).toBe(2);

      // Mark as DONE
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/crm/tasks/${tid}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ status: 'DONE' })
        .expect(200);

      expect(patchRes.body.completedAt).toBeDefined();
      expect(patchRes.body.status).toBe('DONE');

      // Reminders should be canceled (SCHEDULED reminders should be 0)
      const after = await request(app.getHttpServer())
        .get(`/api/crm/tasks/${tid}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);
      expect(after.body.reminders.length).toBe(0);
    });

    it('dueAt change → old reminders canceled, new created', async () => {
      const dueAt1 = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString();
      const createRes = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'dueAt change test', dueAt: dueAt1, assigneeUserId: ownerUserId })
        .expect(201);
      const tid: string = createRes.body.data.id;

      const dueAt2 = new Date(Date.now() + 240 * 60 * 60 * 1000).toISOString();
      await request(app.getHttpServer())
        .patch(`/api/crm/tasks/${tid}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ dueAt: dueAt2 })
        .expect(200);

      const detail = await request(app.getHttpServer())
        .get(`/api/crm/tasks/${tid}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      // Should have 2 new SCHEDULED reminders for the new dueAt
      expect(detail.body.reminders.length).toBe(2);
    });
  });

  // ─── SOFT DELETE ────────────────────────────────────────────────
  describe('Soft Delete', () => {
    it('manager deletes task → 200, then GET → 404', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'To delete' })
        .expect(201);
      const tid: string = res.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/crm/tasks/${tid}`)
        .set('Cookie', managerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/crm/tasks/${tid}`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(404);
    });

    it('viewer cannot delete → 403', async () => {
      // Create task assigned to viewer
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Viewer no delete', assigneeUserId: viewerUserId })
        .expect(201);
      const tid: string = res.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/crm/tasks/${tid}`)
        .set('Cookie', viewerCookies)
        .set('x-org-id', orgId)
        .expect(403);
    });

    it('agent deletes own created+assigned task → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Agent own delete', assigneeUserId: agentUserId })
        .expect(201);
      const tid: string = res.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/crm/tasks/${tid}`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .expect(200);
    });

    it('agent cannot delete task created by another → 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Owner created, agent assigned', assigneeUserId: agentUserId })
        .expect(201);
      const tid: string = res.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/crm/tasks/${tid}`)
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .expect(403);
    });
  });

  // ─── TENANT ISOLATION ──────────────────────────────────────────
  describe('Tenant Isolation', () => {
    let taskOrgA: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Org A task for isolation' })
        .expect(201);
      taskOrgA = res.body.data.id;
    });

    it('orgB cannot read orgA task → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/crm/tasks/${taskOrgA}`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot update orgA task → 404', async () => {
      await request(app.getHttpServer())
        .patch(`/api/crm/tasks/${taskOrgA}`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .send({ title: 'Hacked' })
        .expect(404);
    });

    it('orgB cannot delete orgA task → 404', async () => {
      await request(app.getHttpServer())
        .delete(`/api/crm/tasks/${taskOrgA}`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot assign orgA task → 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/tasks/${taskOrgA}/assign`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .send({ assigneeUserId: otherUserId })
        .expect(404);
    });

    it('orgB cannot create task on orgA lead → 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .send({ title: 'Cross-tenant task' })
        .expect(404);
    });

    it('orgB list does not contain orgA tasks', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/crm/tasks?scope=team')
        .set('Cookie', otherCookies)
        .set('x-org-id', orgIdB)
        .expect(200);

      const found = res.body.items.find((t: any) => t.id === taskOrgA);
      expect(found).toBeUndefined();
    });
  });

  // ─── CURSOR PAGINATION ─────────────────────────────────────────
  describe('Cursor Pagination', () => {
    beforeAll(async () => {
      // Create 5 tasks for pagination testing
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post(`/api/crm/leads/${leadIdA}/tasks`)
          .set('Cookie', ownerCookies)
          .set('x-org-id', orgId)
          .send({ title: `Pagination task ${i}`, assigneeUserId: ownerUserId })
          .expect(201);
      }
    });

    it('walks all tasks with limit=2 cursor pagination', async () => {
      const allIds = new Set<string>();
      let cursor: string | undefined;

      for (let page = 0; page < 20; page++) {
        const url: string = cursor
          ? `/api/crm/tasks?scope=my&limit=2&cursor=${cursor}`
          : '/api/crm/tasks?scope=my&limit=2';

        const res: request.Response = await request(app.getHttpServer())
          .get(url)
          .set('Cookie', ownerCookies)
          .set('x-org-id', orgId)
          .expect(200);

        for (const item of res.body.items) {
          expect(allIds.has(item.id)).toBe(false);
          allIds.add(item.id);
        }

        if (!res.body.page.hasMore) break;
        cursor = res.body.page.nextCursor;
      }

      expect(allIds.size).toBeGreaterThanOrEqual(5);
    });
  });

  // ─── NOTIFICATION: task.assigned ────────────────────────────────
  describe('Notifications', () => {
    it('task creation sends task.assigned notification to assignee', async () => {
      // Clear existing notifs
      const beforeCount = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Notified task', assigneeUserId: agentUserId })
        .expect(201);

      // Wait briefly for async notification
      await new Promise((r) => setTimeout(r, 500));

      const afterCount = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', agentCookies)
        .set('x-org-id', orgId)
        .expect(200);

      expect(afterCount.body.data.count).toBeGreaterThan(beforeCount.body.data.count);
    });

    it('self-assigned task does NOT send notification', async () => {
      const beforeCount = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdA}/tasks`)
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .send({ title: 'Self assigned no notif', assigneeUserId: ownerUserId })
        .expect(201);

      await new Promise((r) => setTimeout(r, 500));

      const afterCount = await request(app.getHttpServer())
        .get('/api/notifications/unread-count')
        .set('Cookie', ownerCookies)
        .set('x-org-id', orgId)
        .expect(200);

      // Count should not increase for self-assignment
      expect(afterCount.body.data.count).toBe(beforeCount.body.data.count);
    });
  });
});

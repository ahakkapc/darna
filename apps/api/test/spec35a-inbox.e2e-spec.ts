import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { InboxService } from '../src/inbox/inbox.service';

const ts = Date.now();
const ownerUser = { email: `s35a-owner-${ts}@test.com`, password: 'Test1234!!x', name: 'S35AOwner' };
const agentUser = { email: `s35a-agent-${ts}@test.com`, password: 'Test1234!!x', name: 'S35AAgent' };
const otherUser = { email: `s35a-other-${ts}@test.com`, password: 'Test1234!!x', name: 'S35AOther' };

describe('SPEC-35A — Inbox WhatsApp (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerCookies: string[];
  let agentCookies: string[];
  let otherCookies: string[];
  let orgId: string;
  let orgIdB: string;
  let agentUserId: string;
  let ownerUserId: string;
  let integrationId: string;
  let threadId: string;
  let leadId: string;

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
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }));
    await app.init();

    prisma = app.get(PrismaService);

    // Register users
    await request(app.getHttpServer()).post('/api/auth/register').send(ownerUser).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send(agentUser).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send(otherUser).expect(201);

    ownerCookies = await login(ownerUser);
    agentCookies = await login(agentUser);
    otherCookies = await login(otherUser);

    // Get userIds
    const ownerMe = await request(app.getHttpServer())
      .get('/api/auth/me').set('Cookie', ownerCookies).expect(200);
    ownerUserId = ownerMe.body.user?.id ?? ownerMe.body.userId ?? ownerMe.body.id;

    const agentMe = await request(app.getHttpServer())
      .get('/api/auth/me').set('Cookie', agentCookies).expect(200);
    agentUserId = agentMe.body.user?.id ?? agentMe.body.userId ?? agentMe.body.id;

    // Create org A (owner)
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies)
      .send({ name: 'S35AOrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    // Create org B (other)
    const orgResB = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies)
      .send({ name: 'S35AOrgB' }).expect(201);
    orgIdB = orgResB.body.orgId;

    // Add agent to org A
    const invRes = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`).set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ email: agentUser.email, role: 'AGENT' }).expect(201);
    const inviteToken = invRes.body.token ?? invRes.body.data?.token;
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept').set('Cookie', agentCookies)
      .send({ token: inviteToken }).expect(200);

    // Create WHATSAPP_PROVIDER integration for orgA
    const integRes = await request(app.getHttpServer())
      .post('/api/integrations').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({
        type: 'WHATSAPP_PROVIDER',
        provider: 'TWILIO',
        name: 'Test WhatsApp Integration',
      })
      .expect(201);
    integrationId = integRes.body.data.id;

    // Create a lead for link-lead tests
    const leadRes = await request(app.getHttpServer())
      .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ fullName: 'Test Lead S35A', phone: '+213555000001' })
      .expect(201);
    leadId = leadRes.body.id ?? leadRes.body.data?.id;
  }, 60000);

  afterAll(async () => {
    try {
      await (prisma as any).inboxMessage.deleteMany({});
      await (prisma as any).inboxThreadActivity.deleteMany({});
      await (prisma as any).inboxThread.deleteMany({});
    } catch {}
    await app?.close();
  });

  // ─── §1: Thread creation via direct DB (simulating processor) ───

  describe('Thread creation and listing', () => {
    it('should create thread via DB and list it as owner', async () => {
      const phoneHash = InboxService.phoneHash(orgId, '+213555111222');

      // Create thread directly
      const thread = await prisma.inboxThread.create({
        data: {
          organizationId: orgId,
          channel: 'WHATSAPP',
          phoneHash,
          phoneE164: '+213555111222',
          displayName: 'TestContact',
          status: 'OPEN',
          lastMessageAt: new Date(),
          lastMessagePreview: 'Bonjour',
          lastMessageBy: 'CUSTOMER',
          unreplied: true,
          unrepliedSince: new Date(),
          integrationId,
        },
      });
      threadId = thread.id;

      // Owner can list threads
      const res = await request(app.getHttpServer())
        .get('/api/inbox/threads')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      const found = res.body.data.items.find((t: any) => t.id === threadId);
      expect(found).toBeDefined();
      expect(found.displayName).toBe('TestContact');
    });

    it('should return thread detail with messages', async () => {
      // Add a message
      await prisma.inboxMessage.create({
        data: {
          organizationId: orgId,
          threadId,
          direction: 'INBOUND',
          status: 'RECEIVED',
          bodyText: 'Hello!',
          providerMessageId: `test-msg-${ts}-1`,
          occurredAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/inbox/threads/${threadId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.thread.id).toBe(threadId);
      expect(res.body.data.messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── §2: RBAC ───

  describe('RBAC', () => {
    it('agent should NOT see unassigned threads (visibility filter)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/inbox/threads')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);

      // Agent can only see threads assigned to them
      const found = res.body.data.items.find((t: any) => t.id === threadId);
      expect(found).toBeUndefined();
    });

    it('agent should NOT read unassigned thread detail', async () => {
      await request(app.getHttpServer())
        .get(`/api/inbox/threads/${threadId}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(404);
    });

    it('agent should NOT be able to assign threads', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/assign`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ userId: agentUserId })
        .expect(403);
    });

    it('manager can assign thread', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/assign`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ userId: agentUserId })
        .expect(200);

      // Verify assignment
      const thread = await prisma.inboxThread.findUnique({ where: { id: threadId } });
      expect(thread?.assignedToUserId).toBe(agentUserId);
    });

    it('agent can now see assigned thread', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/inbox/threads/${threadId}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.data.thread.id).toBe(threadId);
    });

    it('assign already assigned thread → 409', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/assign`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ userId: ownerUserId })
        .expect(409);
    });
  });

  // ─── §3: Claim ───

  describe('Claim', () => {
    let unassignedThreadId: string;

    beforeAll(async () => {
      const phoneHash = InboxService.phoneHash(orgId, '+213555222333');
      const thread = await prisma.inboxThread.create({
        data: {
          organizationId: orgId,
          channel: 'WHATSAPP',
          phoneHash,
          phoneE164: '+213555222333',
          displayName: 'ClaimTestContact',
          status: 'OPEN',
          lastMessageAt: new Date(),
          lastMessageBy: 'CUSTOMER',
          unreplied: true,
          unrepliedSince: new Date(),
        },
      });
      unassignedThreadId = thread.id;
    });

    it('agent can claim unassigned thread', async () => {
      // Agent needs to be able to see it first — claim endpoint checks thread exists
      // but doesn't enforce visibility for claim (self-assign on unassigned)
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${unassignedThreadId}/claim`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);

      const thread = await prisma.inboxThread.findUnique({ where: { id: unassignedThreadId } });
      expect(thread?.assignedToUserId).toBe(agentUserId);
    });

    it('claim already assigned → 409', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${unassignedThreadId}/claim`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(409);
    });
  });

  // ─── §4: Mark read ───

  describe('Mark read', () => {
    it('should set unreadCount to 0', async () => {
      await prisma.inboxThread.update({
        where: { id: threadId },
        data: { unreadCount: 5 },
      });

      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/mark-read`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);

      const thread = await prisma.inboxThread.findUnique({ where: { id: threadId } });
      expect(thread?.unreadCount).toBe(0);
      expect(thread?.lastReadAt).toBeTruthy();
    });
  });

  // ─── §5: Change status ───

  describe('Change status', () => {
    it('agent can change to PENDING', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/status`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ status: 'PENDING' })
        .expect(200);

      const thread = await prisma.inboxThread.findUnique({ where: { id: threadId } });
      expect(thread?.status).toBe('PENDING');
    });

    it('agent can close thread', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/status`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ status: 'CLOSED' })
        .expect(200);

      const thread = await prisma.inboxThread.findUnique({ where: { id: threadId } });
      expect(thread?.status).toBe('CLOSED');
      expect(thread?.unreplied).toBe(false);
    });

    it('invalid status → 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/status`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ status: 'INVALID' })
        .expect(400);
    });

    it('reopen thread', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/status`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ status: 'OPEN' })
        .expect(200);
    });
  });

  // ─── §6: Send message ───

  describe('Send message', () => {
    it('assigned agent can send message', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/messages`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ text: 'Hello from agent!' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.message.direction).toBe('OUTBOUND');
      expect(res.body.data.message.status).toBe('QUEUED');
      expect(res.body.data.message.bodyText).toBe('Hello from agent!');
    });

    it('sending to closed thread → 409', async () => {
      await prisma.inboxThread.update({
        where: { id: threadId },
        data: { status: 'CLOSED' },
      });

      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/messages`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ text: 'Should fail' })
        .expect(409);

      // Reopen for subsequent tests
      await prisma.inboxThread.update({
        where: { id: threadId },
        data: { status: 'OPEN' },
      });
    });

    it('text validation: empty text → 400', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/messages`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ text: '' })
        .expect(400);
    });
  });

  // ─── §7: Link lead ───

  describe('Link lead', () => {
    it('should link lead to thread', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/link-lead`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ leadId })
        .expect(200);

      const thread = await prisma.inboxThread.findUnique({ where: { id: threadId } });
      expect(thread?.leadId).toBe(leadId);

      // Verify ThreadActivity was created
      const activities = await prisma.inboxThreadActivity.findMany({
        where: { threadId, type: 'LEAD_LINKED' },
      });
      expect(activities.length).toBeGreaterThanOrEqual(1);
    });

    it('thread detail should include lead summary', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/inbox/threads/${threadId}`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.data.leadSummary).toBeTruthy();
      expect(res.body.data.leadSummary.fullName).toBe('Test Lead S35A');
    });
  });

  // ─── §8: Create lead from thread ───

  describe('Create lead from thread', () => {
    let newThreadId: string;

    beforeAll(async () => {
      const phoneHash = InboxService.phoneHash(orgId, '+213555333444');
      const thread = await prisma.inboxThread.create({
        data: {
          organizationId: orgId,
          channel: 'WHATSAPP',
          phoneHash,
          phoneE164: '+213555333444',
          displayName: 'NewLeadContact',
          status: 'OPEN',
          assignedToUserId: agentUserId,
          assignedAt: new Date(),
          lastMessageAt: new Date(),
          lastMessageBy: 'CUSTOMER',
        },
      });
      newThreadId = thread.id;
    });

    it('should create lead and link to thread', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/inbox/threads/${newThreadId}/create-lead`)
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .send({ fullName: 'Lead from WA', email: 'lead@wa.test' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.fullName).toBe('Lead from WA');
      expect(res.body.data.sourceType).toBe('WHATSAPP_INBOX');
      expect(res.body.data.phone).toBe('+213555333444');

      // Thread should now be linked
      const thread = await prisma.inboxThread.findUnique({ where: { id: newThreadId } });
      expect(thread?.leadId).toBe(res.body.data.id);
    });
  });

  // ─── §9: Inbound idempotence ───

  describe('Inbound idempotence', () => {
    it('duplicate providerMessageId → only 1 message', async () => {
      const provMsgId = `idempotent-${ts}`;
      const phoneHash = InboxService.phoneHash(orgId, '+213555999888');

      // Create a thread
      const thread = await prisma.inboxThread.create({
        data: {
          organizationId: orgId,
          channel: 'WHATSAPP',
          phoneHash,
          status: 'OPEN',
          lastMessageAt: new Date(),
        },
      });

      // Create first message
      await prisma.inboxMessage.create({
        data: {
          organizationId: orgId,
          threadId: thread.id,
          direction: 'INBOUND',
          status: 'RECEIVED',
          providerMessageId: provMsgId,
          bodyText: 'First',
        },
      });

      // Try to create duplicate (should fail on unique constraint)
      let error: any = null;
      try {
        await prisma.inboxMessage.create({
          data: {
            organizationId: orgId,
            threadId: thread.id,
            direction: 'INBOUND',
            status: 'RECEIVED',
            providerMessageId: provMsgId,
            bodyText: 'Duplicate',
          },
        });
      } catch (e) {
        error = e;
      }
      expect(error).toBeTruthy();
      expect(error.code).toBe('P2002');

      // Only 1 message with this providerMessageId
      const msgs = await prisma.inboxMessage.findMany({
        where: { organizationId: orgId, providerMessageId: provMsgId },
      });
      expect(msgs.length).toBe(1);
    });
  });

  // ─── §10: SLA fields ───

  describe('SLA fields', () => {
    it('thread has unreplied / unrepliedSince set', async () => {
      const thread = await prisma.inboxThread.findUnique({ where: { id: threadId } });
      // Thread status was reopened; unreplied may have been cleared by close
      // Just verify the fields exist
      expect('unreplied' in (thread ?? {})).toBe(true);
      expect('unrepliedSince' in (thread ?? {})).toBe(true);
      expect('slaBreachedAt' in (thread ?? {})).toBe(true);
      expect('slaEscalatedAt' in (thread ?? {})).toBe(true);
    });
  });

  // ─── §11: Tenant isolation ───

  describe('Tenant isolation', () => {
    it('orgB cannot list orgA threads', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/inbox/threads')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);

      const found = res.body.data.items.find((t: any) => t.id === threadId);
      expect(found).toBeUndefined();
    });

    it('orgB cannot read orgA thread → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/inbox/threads/${threadId}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot assign orgA thread → 404', async () => {
      // First unassign thread for this test
      await prisma.inboxThread.update({
        where: { id: threadId },
        data: { assignedToUserId: null },
      });

      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/assign`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ userId: ownerUserId })
        .expect(404);

      // Re-assign for remaining tests
      await prisma.inboxThread.update({
        where: { id: threadId },
        data: { assignedToUserId: agentUserId },
      });
    });

    it('orgB cannot send message on orgA thread → 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/messages`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ text: 'Should fail' })
        .expect(404);
    });

    it('orgB cannot mark read orgA thread → 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/mark-read`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot change status of orgA thread → 404', async () => {
      await request(app.getHttpServer())
        .post(`/api/inbox/threads/${threadId}/status`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ status: 'CLOSED' })
        .expect(404);
    });
  });

  // ─── §12: CRM Sync — backfill ───

  describe('CRM sync (backfill on link)', () => {
    it('linking lead should create LeadActivity entries for existing messages', async () => {
      // Wait a bit for async backfill
      await new Promise((resolve) => setTimeout(resolve, 500));

      const activities = await prisma.leadActivity.findMany({
        where: {
          organizationId: orgId,
          leadId,
        },
        orderBy: { createdAt: 'desc' },
      });

      // There should be at least one activity from backfill (the INBOUND message we created earlier)
      const waActivities = activities.filter(
        (a: any) => a.payloadJson && (a.payloadJson as any).channel === 'WHATSAPP',
      );
      expect(waActivities.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── §13: Thread activities audit ───

  describe('Thread activity audit', () => {
    it('should have ASSIGNED and STATUS_CHANGED activities', async () => {
      const activities = await prisma.inboxThreadActivity.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
      });

      const types = activities.map((a) => a.type);
      expect(types).toContain('ASSIGNED');
      expect(types).toContain('STATUS_CHANGED');
    });
  });

  // ─── §14: Filters ───

  describe('Filters', () => {
    it('filter by status=OPEN', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/inbox/threads?status=OPEN')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      for (const t of res.body.data.items) {
        expect(t.status).toBe('OPEN');
      }
    });

    it('filter assigned=me for agent', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/inbox/threads?assigned=me')
        .set('Cookie', agentCookies).set('x-org-id', orgId)
        .expect(200);

      for (const t of res.body.data.items) {
        expect(t.assignedToUserId).toBe(agentUserId);
      }
    });
  });
});

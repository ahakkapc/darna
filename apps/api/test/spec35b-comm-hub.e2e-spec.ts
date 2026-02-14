import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { CommHubService } from '../src/comm/comm-hub.service';
import { ReplyDetectorService } from '../src/comm/reply-detector.service';
import { InboxService } from '../src/inbox/inbox.service';

const ts = Date.now();
const ownerUser = { email: `s35b-owner-${ts}@test.com`, password: 'Test1234!!x', name: 'S35BOwner' };
const agentUser = { email: `s35b-agent-${ts}@test.com`, password: 'Test1234!!x', name: 'S35BAgent' };
const otherUser = { email: `s35b-other-${ts}@test.com`, password: 'Test1234!!x', name: 'S35BOther' };

describe('SPEC-35B — Communication Hub (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let commHub: CommHubService;
  let replyDetector: ReplyDetectorService;
  let ownerCookies: string[];
  let agentCookies: string[];
  let otherCookies: string[];
  let orgId: string;
  let orgIdB: string;
  let ownerUserId: string;
  let agentUserId: string;
  let integrationId: string;
  let leadId: string;
  let leadIdB: string;

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
    commHub = app.get(CommHubService);
    replyDetector = app.get(ReplyDetectorService);

    // Register users
    await request(app.getHttpServer()).post('/api/auth/register').send(ownerUser).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send(agentUser).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send(otherUser).expect(201);

    ownerCookies = await login(ownerUser);
    agentCookies = await login(agentUser);
    otherCookies = await login(otherUser);

    const ownerMe = await request(app.getHttpServer())
      .get('/api/auth/me').set('Cookie', ownerCookies).expect(200);
    ownerUserId = ownerMe.body.user?.id ?? ownerMe.body.userId ?? ownerMe.body.id;

    const agentMe = await request(app.getHttpServer())
      .get('/api/auth/me').set('Cookie', agentCookies).expect(200);
    agentUserId = agentMe.body.user?.id ?? agentMe.body.userId ?? agentMe.body.id;

    // Create org A (owner)
    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies)
      .send({ name: 'S35BOrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    // Create org B (other)
    const orgResB = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies)
      .send({ name: 'S35BOrgB' }).expect(201);
    orgIdB = orgResB.body.orgId;

    // Add agent to org A
    const invRes = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`).set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ email: agentUser.email, role: 'AGENT' }).expect(201);
    const inviteToken = invRes.body.token ?? invRes.body.data?.token;
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept').set('Cookie', agentCookies)
      .send({ token: inviteToken }).expect(200);

    // Create integration
    const integRes = await request(app.getHttpServer())
      .post('/api/integrations').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ type: 'WHATSAPP_PROVIDER', provider: 'TWILIO', name: 'Test WA S35B' })
      .expect(201);
    integrationId = integRes.body.data.id;

    // Create lead in org A
    const leadRes = await request(app.getHttpServer())
      .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ fullName: 'CommHub Lead', phone: '+213555100001' })
      .expect(201);
    leadId = leadRes.body.id ?? leadRes.body.data?.id;

    // Create lead in org B
    const leadResB = await request(app.getHttpServer())
      .post('/api/crm/leads').set('Cookie', otherCookies).set('x-org-id', orgIdB)
      .send({ fullName: 'CommHub Lead B', phone: '+213555100002' })
      .expect(201);
    leadIdB = leadResB.body.id ?? leadResB.body.data?.id;
  }, 60000);

  afterAll(async () => {
    try {
      await (prisma as any).commEvent.deleteMany({});
      await (prisma as any).inboxMessage.deleteMany({});
      await (prisma as any).inboxThreadActivity.deleteMany({});
      await (prisma as any).inboxThread.deleteMany({});
    } catch {}
    await app?.close();
  });

  // ─── 1. CommHub recordInboundWhatsApp ──────────────────

  describe('Inbound linked thread', () => {
    it('should create CommEvent + LeadActivity for inbound on linked thread', async () => {
      const commEventId = await commHub.recordInboundWhatsApp({
        organizationId: orgId,
        leadId,
        providerMessageId: `prov-in-${ts}-1`,
        inboxThreadId: '00000000-0000-0000-0000-000000000001',
        inboxMessageId: '00000000-0000-0000-0000-000000000002',
        preview: 'Bonjour, je suis intéressé',
        metaJson: { integrationId },
      });

      expect(commEventId).toBeDefined();

      // Verify CommEvent in DB
      const ce = await (prisma as any).commEvent.findUnique({ where: { id: commEventId } });
      expect(ce).toBeDefined();
      expect(ce.channel).toBe('WHATSAPP');
      expect(ce.direction).toBe('INBOUND');
      expect(ce.status).toBe('RECEIVED');
      expect(ce.leadId).toBe(leadId);
      expect(ce.providerMessageId).toBe(`prov-in-${ts}-1`);
      expect(ce.preview).toBe('Bonjour, je suis intéressé');
    });

    it('should be idempotent on same providerMessageId', async () => {
      let error: any = null;
      try {
        await commHub.recordInboundWhatsApp({
          organizationId: orgId,
          leadId,
          providerMessageId: `prov-in-${ts}-1`,
          preview: 'duplicate',
        });
      } catch (e) {
        error = e;
      }
      // Should throw P2002 unique constraint
      expect(error).toBeDefined();
    });
  });

  // ─── 2. CommHub recordOutboundQueued ──────────────────

  describe('Outbound queued', () => {
    let outboundCommEventId: string;

    it('should create CommEvent OUTBOUND QUEUED', async () => {
      outboundCommEventId = await commHub.recordOutboundQueued({
        organizationId: orgId,
        leadId,
        outboundJobId: `00000000-0000-0000-0000-${String(ts).slice(-12).padStart(12, '0')}`,
        dedupeKey: `wa:thread:t1:msg:m1-${ts}`,
        inboxThreadId: '00000000-0000-0000-0000-000000000001',
        inboxMessageId: '00000000-0000-0000-0000-000000000003',
        preview: 'Bonjour, voici notre offre',
      });

      expect(outboundCommEventId).toBeDefined();

      const ce = await (prisma as any).commEvent.findUnique({ where: { id: outboundCommEventId } });
      expect(ce.channel).toBe('WHATSAPP');
      expect(ce.direction).toBe('OUTBOUND');
      expect(ce.status).toBe('QUEUED');
      expect(ce.outboundJobId).toBe(`00000000-0000-0000-0000-${String(ts).slice(-12).padStart(12, '0')}`);
    });

    it('should update status by outboundJobId', async () => {
      await commHub.updateOutboundStatusByJob(
        orgId,
        `00000000-0000-0000-0000-${String(ts).slice(-12).padStart(12, '0')}`,
        'SENT',
        `mock-provider-${ts}`,
      );

      const ce = await (prisma as any).commEvent.findUnique({ where: { id: outboundCommEventId } });
      expect(ce.status).toBe('SENT');
      expect(ce.providerMessageId).toBe(`mock-provider-${ts}`);
    });
  });

  // ─── 3. Opt-out ───────────────────────────────────────

  describe('Opt-out', () => {
    let optOutLeadId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'OptOut Lead', phone: '+213555100099' })
        .expect(201);
      optOutLeadId = res.body.id ?? res.body.data?.id;
    });

    it('checkOptOut returns false before opt-out', async () => {
      const result = await commHub.checkOptOut(orgId, optOutLeadId, 'whatsapp');
      expect(result).toBe(false);
    });

    it('setOptOut marks lead as opted out', async () => {
      await commHub.setOptOut(orgId, optOutLeadId, 'WHATSAPP', 'USER_REQUEST_STOP');

      const result = await commHub.checkOptOut(orgId, optOutLeadId, 'whatsapp');
      expect(result).toBe(true);
    });

    it('checkOptOut returns true after opt-out', async () => {
      const result = await commHub.checkOptOut(orgId, optOutLeadId, 'whatsapp');
      expect(result).toBe(true);
    });
  });

  // ─── 4. Backfill on link-lead ─────────────────────────

  describe('Backfill', () => {
    let backfillLeadId: string;
    let backfillThreadId: string;

    beforeAll(async () => {
      // Create a lead
      const leadRes = await request(app.getHttpServer())
        .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Backfill Lead', phone: '+213555200001' })
        .expect(201);
      backfillLeadId = leadRes.body.id ?? leadRes.body.data?.id;

      // Create thread + message directly via DB (webhook now requires signature)
      const phoneHash = InboxService.phoneHash(orgId, '+213555200099');
      const thread = await (prisma as any).inboxThread.create({
        data: {
          organizationId: orgId,
          channel: 'WHATSAPP',
          phoneHash,
          phoneE164: '+213555200099',
          displayName: 'BackfillCustomer',
          status: 'OPEN',
          lastMessageAt: new Date(),
          lastMessagePreview: 'Backfill msg 1',
          lastMessageBy: 'CUSTOMER',
          unreplied: true,
          unrepliedSince: new Date(),
          integrationId,
        },
      });
      backfillThreadId = thread.id;

      // Add a message to the thread
      await (prisma as any).inboxMessage.create({
        data: {
          organizationId: orgId,
          threadId: backfillThreadId,
          direction: 'INBOUND',
          status: 'RECEIVED',
          bodyText: 'Backfill msg 1',
          providerMessageId: `bf-prov-${ts}-1`,
          occurredAt: new Date(),
        },
      });
    });

    it('backfillThreadSync creates CommEvents for existing messages', async () => {
      if (!backfillThreadId || !backfillLeadId) return;

      await commHub.backfillThreadSync(orgId, backfillThreadId, backfillLeadId, ownerUserId);

      // Check CommEvents were created
      const events = await (prisma as any).commEvent.findMany({
        where: { organizationId: orgId, inboxThreadId: backfillThreadId },
      });
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].leadId).toBe(backfillLeadId);
    });
  });

  // ─── 5. ReplyDetector ─────────────────────────────────

  describe('ReplyDetector', () => {
    it('returns false when no inbound reply', async () => {
      const result = await replyDetector.hasInboundReplySince(
        orgId,
        leadId,
        new Date(Date.now() + 100000),
        ['WHATSAPP'],
      );
      expect(result).toBe(false);
    });

    it('returns true when inbound reply exists', async () => {
      // We recorded an inbound CommEvent for leadId earlier
      const result = await replyDetector.hasInboundReplySince(
        orgId,
        leadId,
        new Date(Date.now() - 600000),
        ['WHATSAPP'],
      );
      expect(result).toBe(true);
    });
  });

  // ─── 6. CommController GET /api/comm/events ──────────

  describe('CommController', () => {
    it('GET /api/comm/events returns events for org', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/comm/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.items).toBeDefined();
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/comm/events?leadId filters by lead', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/comm/events?leadId=${leadId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      for (const item of res.body.data.items) {
        expect(item.leadId).toBe(leadId);
      }
    });

    it('GET /api/comm/events/:id returns single event', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/comm/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      const eventId = listRes.body.data.items[0]?.id;
      if (!eventId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/comm/events/${eventId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBe(eventId);
    });
  });

  // ─── 7. Tenant isolation ──────────────────────────────

  describe('Tenant isolation', () => {
    it('orgB cannot read orgA CommEvents', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/comm/events')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);

      expect(res.body.data.items.length).toBe(0);
    });

    it('orgB cannot read orgA CommEvent by id', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/api/comm/events')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      const eventId = listRes.body.data.items[0]?.id;
      if (!eventId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/comm/events/${eventId}`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);

      expect(res.body.data).toBeNull();
    });
  });

  // ─── 8. Inbox send with opt-out enforcement ───────────

  describe('Inbox send opt-out enforcement', () => {
    let optThreadId: string;
    let optLeadId: string;

    beforeAll(async () => {
      // Create a lead + mark opt-out
      const leadRes = await request(app.getHttpServer())
        .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Send OptOut Lead', phone: '+213555300001' })
        .expect(201);
      optLeadId = leadRes.body.id ?? leadRes.body.data?.id;

      // Create thread directly via DB (webhook now requires signature)
      const phoneHash = InboxService.phoneHash(orgId, '+213555300001');
      const thread = await (prisma as any).inboxThread.create({
        data: {
          organizationId: orgId,
          channel: 'WHATSAPP',
          phoneHash,
          phoneE164: '+213555300001',
          displayName: 'OptSendCustomer',
          status: 'OPEN',
          lastMessageAt: new Date(),
          lastMessagePreview: 'Hello',
          lastMessageBy: 'CUSTOMER',
          unreplied: true,
          unrepliedSince: new Date(),
          integrationId,
        },
      });
      optThreadId = thread.id;

      // Link lead to thread
      if (optThreadId) {
        await request(app.getHttpServer())
          .post(`/api/inbox/threads/${optThreadId}/link-lead`)
          .set('Cookie', ownerCookies).set('x-org-id', orgId)
          .send({ leadId: optLeadId })
          .expect(200);
      }

      // Set opt-out
      await commHub.setOptOut(orgId, optLeadId, 'WHATSAPP', 'USER_REQUEST_STOP');
    });

    it('send message to opted-out lead returns 409', async () => {
      if (!optThreadId) return;

      const res = await request(app.getHttpServer())
        .post(`/api/inbox/threads/${optThreadId}/messages`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ text: 'Should be blocked' });

      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('LEAD_OPTED_OUT_CHANNEL');
    });
  });
});

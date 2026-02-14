import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { SequenceTickService } from '../src/sequences/sequence-tick.service';

const ts = Date.now();
const ownerUser = { email: `s33-owner-${ts}@test.com`, password: 'Test1234!!x', name: 'S33Owner' };
const agentUser = { email: `s33-agent-${ts}@test.com`, password: 'Test1234!!x', name: 'S33Agent' };
const otherUser = { email: `s33-other-${ts}@test.com`, password: 'Test1234!!x', name: 'S33Other' };

describe('SPEC-33 — Templates & Séquences (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tickService: SequenceTickService;
  let ownerCookies: string[];
  let agentCookies: string[];
  let otherCookies: string[];
  let orgId: string;
  let orgIdB: string;
  let leadId: string;
  let leadIdB: string;
  let waTemplateId: string;
  let emailTemplateId: string;
  let sequenceId: string;

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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = app.get(PrismaService);
    tickService = app.get(SequenceTickService);

    await request(app.getHttpServer()).post('/api/auth/register').send(ownerUser).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send(agentUser).expect(201);
    await request(app.getHttpServer()).post('/api/auth/register').send(otherUser).expect(201);

    ownerCookies = await login(ownerUser);
    agentCookies = await login(agentUser);
    otherCookies = await login(otherUser);

    const orgRes = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', ownerCookies)
      .send({ name: 'S33OrgA' }).expect(201);
    orgId = orgRes.body.orgId;

    const orgResB = await request(app.getHttpServer())
      .post('/api/orgs').set('Cookie', otherCookies)
      .send({ name: 'S33OrgB' }).expect(201);
    orgIdB = orgResB.body.orgId;

    const invRes = await request(app.getHttpServer())
      .post(`/api/orgs/${orgId}/invite`).set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ email: agentUser.email, role: 'AGENT' }).expect(201);
    const inviteToken = invRes.body.token ?? invRes.body.data?.token;
    await request(app.getHttpServer())
      .post('/api/orgs/invites/accept').set('Cookie', agentCookies)
      .send({ token: inviteToken }).expect(200);

    // Create integration for outbound jobs
    await request(app.getHttpServer())
      .post('/api/integrations').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ type: 'WHATSAPP_PROVIDER', provider: 'TWILIO', name: 'WA S33' })
      .expect(201);

    const leadRes = await request(app.getHttpServer())
      .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
      .send({ fullName: 'Seq Lead', phone: '+213555900001', email: 'seqlead@test.com' })
      .expect(201);
    leadId = leadRes.body.id ?? leadRes.body.data?.id;

    const leadResB = await request(app.getHttpServer())
      .post('/api/crm/leads').set('Cookie', otherCookies).set('x-org-id', orgIdB)
      .send({ fullName: 'Seq Lead B', phone: '+213555900002' })
      .expect(201);
    leadIdB = leadResB.body.id ?? leadResB.body.data?.id;
  }, 60000);

  afterAll(async () => {
    try {
      await (prisma as any).messageSequenceRunStep.deleteMany({});
      await (prisma as any).messageSequenceRun.deleteMany({});
      await (prisma as any).messageSequenceStep.deleteMany({});
      await (prisma as any).messageSequence.deleteMany({});
      await (prisma as any).messageTemplate.deleteMany({});
    } catch {}
    await app?.close();
  });

  // ─── 1. Templates CRUD ──────────────────────────────

  describe('Templates', () => {
    it('create WhatsApp template', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/templates/messages')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ channel: 'WHATSAPP', name: 'WA Relance', body: 'Bonjour {{leadFirstName}}, comment allez-vous ?' })
        .expect(201);
      expect(res.body.ok).toBe(true);
      waTemplateId = res.body.data.id;
      expect(res.body.data.channel).toBe('WHATSAPP');
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.variablesJson.used).toContain('leadFirstName');
    });

    it('create EMAIL template with subject', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/templates/messages')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ channel: 'EMAIL', name: 'Email Relance', subject: 'Suivi {{leadFullName}}', body: 'Bonjour {{leadFirstName}}' })
        .expect(201);
      emailTemplateId = res.body.data.id;
      expect(res.body.data.channel).toBe('EMAIL');
    });

    it('reject unknown variable', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/templates/messages')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ channel: 'WHATSAPP', name: 'Bad', body: 'Hello {{unknownVar}}' });
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('TEMPLATE_UNKNOWN_VARIABLE');
    });

    it('reject WhatsApp template with subject', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/templates/messages')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ channel: 'WHATSAPP', name: 'Bad', body: 'Hello', subject: 'Subject' });
      expect(res.status).toBe(400);
    });

    it('reject EMAIL template without subject', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/templates/messages')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ channel: 'EMAIL', name: 'Bad', body: 'Hello' });
      expect(res.status).toBe(400);
    });

    it('activate template', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/templates/messages/${waTemplateId}/activate`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('list templates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/templates/messages')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(2);
    });

    it('activate email template too', async () => {
      await request(app.getHttpServer())
        .post(`/api/templates/messages/${emailTemplateId}/activate`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
    });
  });

  // ─── 2. Sequences CRUD ─────────────────────────────

  describe('Sequences', () => {
    it('create sequence', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/sequences')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ name: 'Relance J0 J1', stopOnReply: true })
        .expect(201);
      sequenceId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('set steps (atomic)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/sequences/${sequenceId}/steps`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          steps: [
            { orderIndex: 0, channel: 'WHATSAPP', templateId: waTemplateId, delayMinutes: 0 },
            { orderIndex: 1, channel: 'WHATSAPP', templateId: waTemplateId, delayMinutes: 1440, conditions: [{ key: 'LEAD_NOT_WON' }] },
          ],
        })
        .expect(200);
      expect(res.body.data.steps.length).toBe(2);
    });

    it('reject non-contiguous orderIndex', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/sequences/${sequenceId}/steps`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          steps: [
            { orderIndex: 0, channel: 'WHATSAPP', templateId: waTemplateId, delayMinutes: 0 },
            { orderIndex: 2, channel: 'WHATSAPP', templateId: waTemplateId, delayMinutes: 1440 },
          ],
        });
      expect(res.status).toBe(400);
    });

    it('reject non-increasing delayMinutes', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/sequences/${sequenceId}/steps`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          steps: [
            { orderIndex: 0, channel: 'WHATSAPP', templateId: waTemplateId, delayMinutes: 100 },
            { orderIndex: 1, channel: 'WHATSAPP', templateId: waTemplateId, delayMinutes: 50 },
          ],
        });
      expect(res.status).toBe(400);
    });

    it('activate sequence', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/sequences/${sequenceId}/activate`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('reject steps modification on ACTIVE sequence', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/sequences/${sequenceId}/steps`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ steps: [{ orderIndex: 0, channel: 'WHATSAPP', templateId: waTemplateId, delayMinutes: 0 }] });
      expect(res.status).toBe(400);
    });
  });

  // ─── 3. Runs ────────────────────────────────────────

  describe('Runs', () => {
    let runId: string;

    it('start run on lead', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/sequences/start`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ sequenceId })
        .expect(201);
      runId = res.body.data.id;
      expect(res.body.data.status).toBe('RUNNING');
      expect(res.body.data.nextStepIndex).toBe(0);
    });

    it('reject duplicate run (409)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/sequences/start`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ sequenceId });
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('SEQUENCE_ALREADY_RUNNING');
    });

    it('list runs for lead', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/crm/leads/${leadId}/sequences`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
    });

    it('tick executes step 0 and creates OutboundJob', async () => {
      // Force nextStepAt to past
      await (prisma as any).messageSequenceRun.update({
        where: { id: runId },
        data: { nextStepAt: new Date(Date.now() - 60_000) },
      });

      const result = await tickService.tick();
      expect(result.processed).toBeGreaterThanOrEqual(1);

      // Check RunStep created
      const runSteps = await (prisma as any).messageSequenceRunStep.findMany({
        where: { runId },
        orderBy: { orderIndex: 'asc' },
      });
      expect(runSteps.length).toBeGreaterThanOrEqual(1);
      expect(['SCHEDULED', 'SENT']).toContain(runSteps[0].status);
    });

    it('stop run', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/sequences/stop`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ sequenceRunId: runId })
        .expect(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ─── 4. Sequence not ACTIVE ─────────────────────────

  describe('Sequence not active', () => {
    it('reject start on non-ACTIVE sequence', async () => {
      // Create a DRAFT sequence
      const seqRes = await request(app.getHttpServer())
        .post('/api/sequences')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ name: 'Draft Seq' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadId}/sequences/start`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ sequenceId: seqRes.body.data.id });
      expect(res.status).toBe(409);
      expect(res.body.error?.code).toBe('SEQUENCE_NOT_ACTIVE');
    });
  });

  // ─── 5. Tenant isolation ────────────────────────────

  describe('Tenant isolation', () => {
    it('orgB cannot see orgA templates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/templates/messages')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });

    it('orgB cannot see orgA sequences', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sequences')
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .expect(200);
      expect(res.body.data.items.length).toBe(0);
    });

    it('orgB cannot start orgA sequence on orgB lead (404)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/crm/leads/${leadIdB}/sequences/start`)
        .set('Cookie', otherCookies).set('x-org-id', orgIdB)
        .send({ sequenceId });
      expect([404, 409]).toContain(res.status);
    });
  });

  // ─── 6. Condition skip ──────────────────────────────

  describe('Condition skip', () => {
    it('step skipped when lead status is WON and condition LEAD_NOT_WON', async () => {
      // Create a lead then mark as WON (status not accepted in CreateLeadDto)
      const wonLeadRes = await request(app.getHttpServer())
        .post('/api/crm/leads').set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ fullName: 'Won Lead', phone: '+213555900099' })
        .expect(201);
      const wonLeadId = wonLeadRes.body.id ?? wonLeadRes.body.data?.id;

      // Mark the lead as WON
      await request(app.getHttpServer())
        .patch(`/api/crm/leads/${wonLeadId}`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ status: 'WON' })
        .expect(200);

      // Create sequence with LEAD_NOT_WON condition on step 0
      const condSeqRes = await request(app.getHttpServer())
        .post('/api/sequences')
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ name: 'Cond Seq', stopOnReply: false })
        .expect(201);

      await request(app.getHttpServer())
        .put(`/api/sequences/${condSeqRes.body.data.id}/steps`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({
          steps: [
            { orderIndex: 0, channel: 'WHATSAPP', templateId: waTemplateId, delayMinutes: 0, conditions: [{ key: 'LEAD_NOT_WON' }] },
          ],
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/sequences/${condSeqRes.body.data.id}/activate`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .expect(200);

      const runRes = await request(app.getHttpServer())
        .post(`/api/crm/leads/${wonLeadId}/sequences/start`)
        .set('Cookie', ownerCookies).set('x-org-id', orgId)
        .send({ sequenceId: condSeqRes.body.data.id })
        .expect(201);

      // Force nextStepAt to past
      await (prisma as any).messageSequenceRun.update({
        where: { id: runRes.body.data.id },
        data: { nextStepAt: new Date(Date.now() - 60_000) },
      });

      await tickService.tick();

      const runSteps = await (prisma as any).messageSequenceRunStep.findMany({
        where: { runId: runRes.body.data.id },
      });
      expect(runSteps.length).toBeGreaterThanOrEqual(1);
      expect(runSteps[0].status).toBe('SKIPPED');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, ValidationPipe, ValidationError } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3ClientService } from '../src/storage/s3.client';
import { JobsService } from '../src/jobs/jobs.service';
import { BullMQClient } from '../src/jobs/bullmq.client';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { HttpLoggingInterceptor } from '../src/common/interceptors/http-logging.interceptor';

function flattenErrors(errors: ValidationError[], parent?: string): { path: string; message: string }[] {
  const result: { path: string; message: string }[] = [];
  for (const err of errors) {
    const field = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      for (const msg of Object.values(err.constraints)) {
        result.push({ path: field, message: msg });
      }
    }
    if (err.children && err.children.length > 0) {
      result.push(...flattenErrors(err.children, field));
    }
  }
  return result;
}

async function createApp() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new HttpLoggingInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        return new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: { fields: flattenErrors(errors) },
          },
        });
      },
    }),
  );
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    s3: app.get(S3ClientService),
    jobs: app.get(JobsService),
    bullmq: app.get(BullMQClient),
  };
}

async function registerAndLogin(app: INestApplication, email: string, password = 'password1234') {
  await request(app.getHttpServer()).post('/api/auth/register').send({ email, password });
  const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password });
  const cookies = loginRes.headers['set-cookie'] as unknown as string[];
  return { cookies };
}

async function createOrg(app: INestApplication, cookies: string[], name: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/orgs')
    .set('Cookie', cookies)
    .send({ name });
  return res.body.orgId;
}

function makeJpegBuffer(sizeBytes: number): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  buf[0] = 0xff; buf[1] = 0xd8; buf[2] = 0xff; buf[3] = 0xe0;
  return buf;
}

function sha256hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('SPEC-05 — Jobs / Queue / Workers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s3: S3ClientService;
  let jobs: JobsService;
  let bullmq: BullMQClient;

  const TS = Date.now();
  const userEmail = `jobs-user-${TS}@test.com`;
  const adminEmail = `jobs-admin-${TS}@test.com`;
  let userCookies: string[];
  let adminCookies: string[];
  let orgId: string;

  beforeAll(async () => {
    const setup = await createApp();
    app = setup.app;
    prisma = setup.prisma;
    s3 = setup.s3;
    jobs = setup.jobs;
    bullmq = setup.bullmq;

    const u = await registerAndLogin(app, userEmail);
    userCookies = u.cookies;
    orgId = await createOrg(app, userCookies, `JobsOrg-${TS}`);

    const a = await registerAndLogin(app, adminEmail);
    adminCookies = a.cookies;
    await prisma.user.updateMany({ where: { email: adminEmail }, data: { platformRole: 'PLATFORM_ADMIN' } });
    const a2 = await registerAndLogin(app, adminEmail);
    adminCookies = a2.cookies;
  }, 30000);

  afterAll(async () => {
    await prisma.jobLock.deleteMany({});
    await prisma.jobRun.deleteMany({});
    const orgIds = [orgId].filter(Boolean);
    await prisma.documentLink.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.fileBlob.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.uploadSession.deleteMany({ where: { organizationId: { in: orgIds } } });
    await app.close();
  }, 30000);

  // ─── Enqueue + JobRun creation ────────────────────────────────
  describe('JobsService.enqueue', () => {
    it('creates a JobRun with QUEUED status', async () => {
      const result = await jobs.enqueue('NOTIFY_EMAIL', {
        template: 'test',
        to: 'a@b.com',
      }, { organizationId: orgId, idempotencyKey: `email:test:${TS}` });

      expect(result.jobRunId).toBeDefined();
      expect(result.deduplicated).toBe(false);

      const run = await prisma.jobRun.findUnique({ where: { id: result.jobRunId } });
      expect(run).not.toBeNull();
      expect(run!.type).toBe('NOTIFY_EMAIL');
      expect(run!.status).toBe('QUEUED');
      expect(run!.organizationId).toBe(orgId);
    });

    it('idempotence: same key → returns existing job, deduplicated=true', async () => {
      const key = `email:idem:${TS}`;
      const r1 = await jobs.enqueue('NOTIFY_EMAIL', { template: 'x' }, { organizationId: orgId, idempotencyKey: key });
      const r2 = await jobs.enqueue('NOTIFY_EMAIL', { template: 'x' }, { organizationId: orgId, idempotencyKey: key });

      expect(r1.jobRunId).toBe(r2.jobRunId);
      expect(r2.deduplicated).toBe(true);
    });

    it('different org same key → creates separate jobs', async () => {
      const key = `email:cross:${TS}`;
      const fakeOrgId = '00000000-0000-4000-a000-000000000099';
      const r1 = await jobs.enqueue('NOTIFY_EMAIL', { template: 'x' }, { organizationId: orgId, idempotencyKey: key });
      const r2 = await jobs.enqueue('NOTIFY_EMAIL', { template: 'x' }, { organizationId: fakeOrgId, idempotencyKey: key });

      expect(r1.jobRunId).not.toBe(r2.jobRunId);
    });
  });

  // ─── Confirm triggers job enqueue ─────────────────────────────
  describe('Storage confirm triggers AV_SCAN + IMAGE_DERIVATIVES', () => {
    it('after confirm → AV_SCAN_DOCUMENT and IMAGE_DERIVATIVES jobs created', async () => {
      const file = makeJpegBuffer(512);
      const fileSha = sha256hex(file);

      const presignRes = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', userCookies)
        .set('x-org-id', orgId)
        .send({ mimeType: 'image/jpeg', sizeBytes: 512, originalFilename: 'trigger.jpg' })
        .expect(201);

      await s3.putObject(presignRes.body.data.storageKey, file, 'image/jpeg');

      const confirmRes = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', userCookies)
        .set('x-org-id', orgId)
        .send({
          uploadSessionId: presignRes.body.data.uploadSessionId,
          sha256: fileSha,
          document: { kind: 'IMAGE', title: 'Trigger test' },
        })
        .expect(200);

      const blobId = confirmRes.body.data.fileBlobId;

      // Wait a moment for async enqueue
      await new Promise((r) => setTimeout(r, 500));

      const avJob = await prisma.jobRun.findFirst({
        where: { type: 'AV_SCAN_DOCUMENT', idempotencyKey: `avscan:${blobId}` },
      });
      expect(avJob).not.toBeNull();
      expect(avJob!.status).toBe('QUEUED');
      expect(avJob!.organizationId).toBe(orgId);

      const derivJob = await prisma.jobRun.findFirst({
        where: { type: 'IMAGE_DERIVATIVES', idempotencyKey: `deriv:${blobId}:v1` },
      });
      expect(derivJob).not.toBeNull();
    });
  });

  // ─── Admin endpoints ──────────────────────────────────────────
  describe('Admin jobs endpoints', () => {
    it('GET /admin/jobs requires platform admin', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/jobs')
        .set('Cookie', userCookies)
        .expect(403);
    });

    it('GET /admin/jobs returns paginated list for admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/jobs')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.page).toBe(1);
    });

    it('GET /admin/jobs?type=NOTIFY_EMAIL filters by type', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/admin/jobs?type=NOTIFY_EMAIL')
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.items.every((j: { type: string }) => j.type === 'NOTIFY_EMAIL')).toBe(true);
    });

    it('GET /admin/jobs/:id returns job detail', async () => {
      const firstJob = await prisma.jobRun.findFirst();
      const res = await request(app.getHttpServer())
        .get(`/api/admin/jobs/${firstJob!.id}`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.id).toBe(firstJob!.id);
    });

    it('POST /admin/jobs/:id/retry on QUEUED job → 404', async () => {
      const queuedJob = await prisma.jobRun.findFirst({ where: { status: 'QUEUED' } });
      await request(app.getHttpServer())
        .post(`/api/admin/jobs/${queuedJob!.id}/retry`)
        .set('Cookie', adminCookies)
        .expect(404);
    });

    it('POST /admin/jobs/:id/retry on FAILED job → re-queues', async () => {
      // Create a failed job
      const failedJob = await prisma.jobRun.create({
        data: {
          type: 'NOTIFY_EMAIL',
          organizationId: orgId,
          payloadJson: { test: true } as any,
          status: 'FAILED',
          maxAttempts: 3,
          attempts: 3,
          lastErrorCode: 'TEST_ERROR',
        },
      });

      const res = await request(app.getHttpServer())
        .post(`/api/admin/jobs/${failedJob.id}/retry`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.ok).toBe(true);

      const updated = await prisma.jobRun.findUnique({ where: { id: failedJob.id } });
      expect(updated!.status).toBe('QUEUED');
      expect(updated!.attempts).toBe(0);
    });
  });

  // ─── Health check includes queue ──────────────────────────────
  describe('Health check with queue', () => {
    it('GET /health includes queue status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body.queue).toBe('up');
      expect(res.body.db).toBe('up');
      expect(res.body.worker).toBeDefined();
      expect(res.body.ts).toBeDefined();
    });
  });

  // ─── Storage GC admin trigger ─────────────────────────────────
  describe('Storage GC admin trigger', () => {
    it('POST /admin/jobs/run/storage-gc creates GC job', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/admin/jobs/run/storage-gc?orgId=${orgId}`)
        .set('Cookie', adminCookies)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.jobRunId).toBeDefined();

      const gcJob = await prisma.jobRun.findUnique({ where: { id: res.body.jobRunId } });
      expect(gcJob!.type).toBe('STORAGE_GC');
      expect(gcJob!.organizationId).toBe(orgId);
    });

    it('POST /admin/jobs/run/storage-gc without orgId → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/admin/jobs/run/storage-gc')
        .set('Cookie', adminCookies)
        .expect(400);
    });
  });
});

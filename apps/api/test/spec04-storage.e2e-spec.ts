import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, BadRequestException, ValidationPipe, ValidationError } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3ClientService } from '../src/storage/s3.client';
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
  return { app, prisma: app.get(PrismaService), s3: app.get(S3ClientService) };
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
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

function makePngBuffer(sizeBytes: number): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  return buf;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('SPEC-04 — Storage Core (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let s3: S3ClientService;

  const TS = Date.now();
  const userAEmail = `storage-a-${TS}@test.com`;
  const userBEmail = `storage-b-${TS}@test.com`;
  let cookiesA: string[];
  let cookiesB: string[];
  let orgIdA: string;
  let orgIdB: string;

  beforeAll(async () => {
    const setup = await createApp();
    app = setup.app;
    prisma = setup.prisma;
    s3 = setup.s3;

    const a = await registerAndLogin(app, userAEmail);
    cookiesA = a.cookies;
    orgIdA = await createOrg(app, cookiesA, `StorageOrgA-${TS}`);

    const b = await registerAndLogin(app, userBEmail);
    cookiesB = b.cookies;
    orgIdB = await createOrg(app, cookiesB, `StorageOrgB-${TS}`);
  }, 30000);

  afterAll(async () => {
    const orgIds = [orgIdA, orgIdB].filter(Boolean);
    await prisma.documentLink.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.documentVersion.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.document.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.fileBlob.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.uploadSession.deleteMany({ where: { organizationId: { in: orgIds } } });
    await app.close();
  }, 30000);

  // ─── Presign ──────────────────────────────────────────────────
  describe('Presign', () => {
    it('POST /storage/upload/presign → returns upload URL', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 1024, originalFilename: 'photo.jpg' })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.uploadSessionId).toBeDefined();
      expect(res.body.data.method).toBe('PUT');
      expect(res.body.data.url).toContain('http');
      expect(res.body.data.storageKey).toContain(`org/${orgIdA}/uploads/`);
    });

    it('rejects unsupported MIME type', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'text/plain', sizeBytes: 100, originalFilename: 'readme.txt' })
        .expect(400);

      expect(res.body.error.code).toBe('UNSUPPORTED_MIME_TYPE');
    });

    it('rejects file too large', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 11 * 1024 * 1024, originalFilename: 'big.jpg' })
        .expect(400);

      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    });
  });

  // ─── Presign + upload + confirm full flow ─────────────────────
  describe('Presign + Confirm flow', () => {
    let documentId: string;
    let fileBlobId: string;

    it('full flow: presign → upload → confirm → document created', async () => {
      const fileContent = makeJpegBuffer(512);
      const fileSha = sha256(fileContent);

      // 1. Presign
      const presignRes = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 512, originalFilename: 'test.jpg' })
        .expect(201);

      const { uploadSessionId, storageKey } = presignRes.body.data;

      // 2. Upload directly to S3 (simulate client PUT)
      await s3.putObject(storageKey, fileContent, 'image/jpeg');

      // 3. Confirm
      const confirmRes = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId,
          sha256: fileSha,
          document: { kind: 'IMAGE', title: 'Test photo' },
        })
        .expect(200);

      expect(confirmRes.body.ok).toBe(true);
      expect(confirmRes.body.data.documentId).toBeDefined();
      expect(confirmRes.body.data.versionId).toBeDefined();
      expect(confirmRes.body.data.fileBlobId).toBeDefined();

      documentId = confirmRes.body.data.documentId;
      fileBlobId = confirmRes.body.data.fileBlobId;
    });

    it('GET /storage/documents/:id → returns document metadata', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/storage/documents/${documentId}`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.id).toBe(documentId);
      expect(res.body.data.kind).toBe('IMAGE');
      expect(res.body.data.versions.length).toBe(1);
      expect(res.body.data.versions[0].isCurrent).toBe(true);
    });

    it('GET /storage/documents/:id/download → returns signed URL (SAFE blob)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/storage/documents/${documentId}/download`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(res.body.ok).toBe(true);
      expect(res.body.data.url).toContain('http');
      expect(res.body.data.expiresInSeconds).toBe(120);
    });

    it('confirm same sha256 in same org → dedup (same blob)', async () => {
      const fileContent = makeJpegBuffer(512);
      const fileSha = sha256(fileContent);

      const presignRes = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 512, originalFilename: 'dup.jpg' })
        .expect(201);

      await s3.putObject(presignRes.body.data.storageKey, fileContent, 'image/jpeg');

      const confirmRes = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presignRes.body.data.uploadSessionId,
          sha256: fileSha,
          document: { kind: 'IMAGE', title: 'Dup photo' },
        })
        .expect(200);

      expect(confirmRes.body.data.documentId).not.toBe(documentId);
      expect(confirmRes.body.data.fileBlobId).toBe(fileBlobId);
    });
  });

  // ─── Tenant isolation ─────────────────────────────────────────
  describe('Tenant isolation', () => {
    let docIdA: string;

    it('setup: orgA creates a document', async () => {
      const fileContent = makeJpegBuffer(256);
      const fileSha = sha256(fileContent);

      const presignRes = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 256, originalFilename: 'iso.jpg' })
        .expect(201);

      await s3.putObject(presignRes.body.data.storageKey, fileContent, 'image/jpeg');

      const confirmRes = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presignRes.body.data.uploadSessionId,
          sha256: fileSha,
          document: { kind: 'IMAGE' },
        })
        .expect(200);

      docIdA = confirmRes.body.data.documentId;
    });

    it('orgB cannot read orgA document → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/storage/documents/${docIdA}`)
        .set('Cookie', cookiesB)
        .set('x-org-id', orgIdB)
        .expect(404);
    });

    it('orgB cannot download orgA document → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/storage/documents/${docIdA}/download`)
        .set('Cookie', cookiesB)
        .set('x-org-id', orgIdB)
        .expect(404);
    });

    it('same sha256 in orgB → creates separate FileBlob', async () => {
      const fileContent = makeJpegBuffer(256);
      const fileSha = sha256(fileContent);

      const presignRes = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesB)
        .set('x-org-id', orgIdB)
        .send({ mimeType: 'image/jpeg', sizeBytes: 256, originalFilename: 'iso.jpg' })
        .expect(201);

      await s3.putObject(presignRes.body.data.storageKey, fileContent, 'image/jpeg');

      const confirmRes = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesB)
        .set('x-org-id', orgIdB)
        .send({
          uploadSessionId: presignRes.body.data.uploadSessionId,
          sha256: fileSha,
          document: { kind: 'IMAGE' },
        })
        .expect(200);

      const blobA = await prisma.fileBlob.findFirst({ where: { organizationId: orgIdA, sha256: fileSha } });
      const blobB = await prisma.fileBlob.findFirst({ where: { organizationId: orgIdB, sha256: fileSha } });
      expect(blobA).not.toBeNull();
      expect(blobB).not.toBeNull();
      expect(blobA!.id).not.toBe(blobB!.id);
    });
  });

  // ─── Expiration ───────────────────────────────────────────────
  describe('Upload expiration', () => {
    it('confirm expired session → 410 UPLOAD_EXPIRED', async () => {
      // Create a presign first then manually expire it
      const presignRes = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 100, originalFilename: 'expired.jpg' })
        .expect(201);

      // Force expire the session
      await prisma.uploadSession.update({
        where: { id: presignRes.body.data.uploadSessionId },
        data: { expiresAt: new Date(Date.now() - 60000) },
      });

      const session = { id: presignRes.body.data.uploadSessionId };

      const res = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: session.id,
          sha256: 'a'.repeat(64),
          document: { kind: 'IMAGE' },
        })
        .expect(410);

      expect(res.body.error.code).toBe('UPLOAD_EXPIRED');
    });
  });

  // ─── Signature mismatch ───────────────────────────────────────
  describe('Magic bytes / signature mismatch', () => {
    it('text file with image/jpeg mime → 400 FILE_SIGNATURE_MISMATCH', async () => {
      const textContent = Buffer.from('This is just a text file, not an image!');

      const presignRes = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: textContent.length, originalFilename: 'fake.jpg' })
        .expect(201);

      await s3.putObject(presignRes.body.data.storageKey, textContent, 'image/jpeg');

      const res = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presignRes.body.data.uploadSessionId,
          sha256: sha256(textContent),
          document: { kind: 'IMAGE' },
        })
        .expect(400);

      expect(res.body.error.code).toBe('FILE_SIGNATURE_MISMATCH');

      const updated = await prisma.uploadSession.findUnique({
        where: { id: presignRes.body.data.uploadSessionId },
      });
      expect(updated!.status).toBe('ABORTED');
    });
  });

  // ─── Download safety ──────────────────────────────────────────
  describe('Download safety (QUARANTINED blob)', () => {
    it('QUARANTINED blob → download returns 403 DOCUMENT_NOT_SAFE', async () => {
      const fileContent = makePngBuffer(128);
      const fileSha = sha256(fileContent);

      const presignRes = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/png', sizeBytes: 128, originalFilename: 'q.png' })
        .expect(201);

      await s3.putObject(presignRes.body.data.storageKey, fileContent, 'image/png');

      const confirmRes = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presignRes.body.data.uploadSessionId,
          sha256: fileSha,
          document: { kind: 'IMAGE' },
        })
        .expect(200);

      // Force blob to QUARANTINED
      await prisma.fileBlob.update({
        where: { id: confirmRes.body.data.fileBlobId },
        data: { status: 'QUARANTINED' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/storage/documents/${confirmRes.body.data.documentId}/download`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .expect(403);

      expect(res.body.error.code).toBe('DOCUMENT_NOT_SAFE');
    });
  });

  // ─── New version ──────────────────────────────────────────────
  describe('New version', () => {
    it('POST /documents/:id/new-version → creates version 2', async () => {
      const file1 = makeJpegBuffer(300);
      const presign1 = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 300, originalFilename: 'v1.jpg' })
        .expect(201);
      await s3.putObject(presign1.body.data.storageKey, file1, 'image/jpeg');
      const confirm1 = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presign1.body.data.uploadSessionId,
          sha256: sha256(file1),
          document: { kind: 'IMAGE', title: 'Versioned doc' },
        })
        .expect(200);

      const docId = confirm1.body.data.documentId;

      // New version
      const file2 = makeJpegBuffer(400);
      const presign2 = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 400, originalFilename: 'v2.jpg' })
        .expect(201);
      await s3.putObject(presign2.body.data.storageKey, file2, 'image/jpeg');

      const versionRes = await request(app.getHttpServer())
        .post(`/api/storage/documents/${docId}/new-version`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presign2.body.data.uploadSessionId,
          sha256: sha256(file2),
        })
        .expect(200);

      expect(versionRes.body.ok).toBe(true);
      expect(versionRes.body.data.version).toBe(2);

      // Check only version 2 is current
      const docRes = await request(app.getHttpServer())
        .get(`/api/storage/documents/${docId}`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .expect(200);

      expect(docRes.body.data.versions.length).toBe(1);
      expect(docRes.body.data.versions[0].version).toBe(2);
      expect(docRes.body.data.versions[0].isCurrent).toBe(true);
    });
  });

  // ─── Soft delete ──────────────────────────────────────────────
  describe('Soft delete', () => {
    it('DELETE /documents/:id → sets status=DELETED, subsequent GET → 404', async () => {
      const file = makeJpegBuffer(200);
      const presign = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 200, originalFilename: 'del.jpg' })
        .expect(201);
      await s3.putObject(presign.body.data.storageKey, file, 'image/jpeg');
      const confirm = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presign.body.data.uploadSessionId,
          sha256: sha256(file),
          document: { kind: 'IMAGE' },
        })
        .expect(200);

      const docId = confirm.body.data.documentId;

      await request(app.getHttpServer())
        .delete(`/api/storage/documents/${docId}`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/storage/documents/${docId}`)
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .expect(404);
    });
  });

  // ─── Confirm already confirmed ────────────────────────────────
  describe('Double confirm', () => {
    it('confirm already confirmed session → 409', async () => {
      const file = makeJpegBuffer(100);
      const presign = await request(app.getHttpServer())
        .post('/api/storage/upload/presign')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({ mimeType: 'image/jpeg', sizeBytes: 100, originalFilename: 'once.jpg' })
        .expect(201);
      await s3.putObject(presign.body.data.storageKey, file, 'image/jpeg');

      await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presign.body.data.uploadSessionId,
          sha256: sha256(file),
          document: { kind: 'IMAGE' },
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/api/storage/upload/confirm')
        .set('Cookie', cookiesA)
        .set('x-org-id', orgIdA)
        .send({
          uploadSessionId: presign.body.data.uploadSessionId,
          sha256: sha256(file),
          document: { kind: 'IMAGE' },
        })
        .expect(409);

      expect(res.body.error.code).toBe('UPLOAD_ALREADY_CONFIRMED');
    });
  });
});

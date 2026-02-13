import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3ClientService } from './s3.client';
import { JobsService } from '../jobs/jobs.service';
import { AppError } from '../common/errors/app-error';
import { withOrg } from '../tenancy/with-org';
import { verifyMagicBytes, isAllowedMime, maxSizeForMime, sanitizeFilename } from './magic-bytes';

const IS_DEV = process.env.NODE_ENV !== 'production';
const PRESIGN_TTL_SEC = 900;
const DOWNLOAD_TTL_SEC = 120;

@Injectable()
export class StorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3ClientService,
    private readonly jobsService: JobsService,
  ) {}

  async presign(orgId: string, userId: string, dto: { mimeType: string; sizeBytes: number; originalFilename: string }) {
    if (!isAllowedMime(dto.mimeType)) {
      throw new AppError('UNSUPPORTED_MIME_TYPE', 400, `MIME type ${dto.mimeType} is not allowed`);
    }
    const maxSize = maxSizeForMime(dto.mimeType);
    if (dto.sizeBytes > maxSize) {
      throw new AppError('FILE_TOO_LARGE', 400, `File exceeds max size of ${maxSize} bytes`);
    }

    const filename = sanitizeFilename(dto.originalFilename);
    const bucket = this.s3.getBucket();

    const session = await withOrg(this.prisma, orgId, async (tx) => {
      return tx.uploadSession.create({
        data: {
          organizationId: orgId,
          createdByUserId: userId,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000),
          bucket,
          storageKey: '', // placeholder, will update
          mimeType: dto.mimeType,
          sizeBytes: dto.sizeBytes,
          originalFilename: filename,
        },
      });
    });

    const storageKey = `org/${orgId}/uploads/${session.id}`;

    await withOrg(this.prisma, orgId, async (tx) => {
      await tx.uploadSession.update({
        where: { id: session.id },
        data: { storageKey },
      });
    });

    const url = await this.s3.presignPut(storageKey, dto.mimeType, PRESIGN_TTL_SEC);

    return {
      uploadSessionId: session.id,
      method: 'PUT',
      url,
      headers: { 'Content-Type': dto.mimeType },
      expiresAt: session.expiresAt.toISOString(),
      storageKey,
    };
  }

  async confirm(orgId: string, userId: string, dto: {
    uploadSessionId: string;
    sha256: string;
    etag?: string;
    document: { kind: string; title?: string; visibility?: string };
    link?: { targetType: string; targetId: string; tag?: string };
  }) {
    if (dto.document.visibility === 'PUBLIC') {
      throw new AppError('VISIBILITY_NOT_SUPPORTED_YET', 400, 'PUBLIC visibility is not supported yet');
    }

    // Phase 1: validate session (read-only checks + status updates that must persist on error)
    const session = await withOrg(this.prisma, orgId, async (tx) => {
      return tx.uploadSession.findUnique({ where: { id: dto.uploadSessionId } });
    });
    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Upload session not found');
    }
    if (session.expiresAt < new Date()) {
      await this.prisma.uploadSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });
      throw new AppError('UPLOAD_EXPIRED', 410, 'Upload session expired');
    }
    if (session.status === 'CONFIRMED') {
      throw new AppError('UPLOAD_ALREADY_CONFIRMED', 409, 'Upload already confirmed');
    }
    if (session.status === 'ABORTED') {
      throw new AppError('NOT_FOUND', 404, 'Upload session aborted');
    }

    const head = await this.s3.headObject(session.storageKey);
    if (!head) {
      throw new AppError('UPLOAD_NOT_FOUND_IN_STORAGE', 400, 'File not found in storage');
    }
    if (head.size !== session.sizeBytes) {
      throw new AppError('UPLOAD_SIZE_MISMATCH', 400, `Expected ${session.sizeBytes} bytes, got ${head.size}`);
    }

    const headerBytes = await this.s3.getObjectRange(session.storageKey, 0, 15);
    if (!verifyMagicBytes(headerBytes, session.mimeType)) {
      await this.prisma.uploadSession.update({ where: { id: session.id }, data: { status: 'ABORTED' } });
      throw new AppError('FILE_SIGNATURE_MISMATCH', 400, 'File signature does not match declared MIME type');
    }

    this.validateKindMime(dto.document.kind, session.mimeType);

    // Phase 2: create blob + doc + version + link (all in one transaction)
    const result = await withOrg(this.prisma, orgId, async (tx) => {
      let blob = await tx.fileBlob.findFirst({
        where: { organizationId: orgId, sha256: dto.sha256 },
      });

      if (!blob) {
        const blobKey = `org/${orgId}/blobs/${dto.sha256}`;
        await this.s3.copyObject(session.storageKey, blobKey);

        blob = await tx.fileBlob.create({
          data: {
            organizationId: orgId,
            sha256: dto.sha256,
            sizeBytes: session.sizeBytes,
            mimeType: session.mimeType,
            bucket: session.bucket,
            storageKey: blobKey,
            etag: head.etag ?? dto.etag,
            status: IS_DEV ? 'SAFE' : 'QUARANTINED',
          },
        });
      }

      const doc = await tx.document.create({
        data: {
          organizationId: orgId,
          kind: dto.document.kind as any,
          title: dto.document.title,
          visibility: 'PRIVATE',
          status: 'ACTIVE',
          createdByUserId: userId,
        },
      });

      const version = await tx.documentVersion.create({
        data: {
          organizationId: orgId,
          documentId: doc.id,
          fileBlobId: blob.id,
          version: 1,
          isCurrent: true,
          originalFilename: session.originalFilename,
          createdByUserId: userId,
        },
      });

      if (dto.link) {
        await tx.documentLink.create({
          data: {
            organizationId: orgId,
            documentId: doc.id,
            targetType: dto.link.targetType as any,
            targetId: dto.link.targetId,
            tag: dto.link.tag,
          },
        });
      }

      await tx.uploadSession.update({
        where: { id: session.id },
        data: {
          status: 'CONFIRMED',
          sha256: dto.sha256,
          etag: head.etag ?? dto.etag,
          documentId: doc.id,
        },
      });

      return { documentId: doc.id, versionId: version.id, fileBlobId: blob.id, _kind: dto.document.kind };
    });

    // Enqueue jobs after successful confirm (outside transaction)
    this.enqueuePostConfirmJobs(orgId, result.fileBlobId, result._kind, userId).catch(() => {});

    return { documentId: result.documentId, versionId: result.versionId, fileBlobId: result.fileBlobId };
  }

  private async enqueuePostConfirmJobs(orgId: string, fileBlobId: string, kind: string, userId: string) {
    await this.jobsService.enqueue('AV_SCAN_DOCUMENT', {
      organizationId: orgId,
      fileBlobId,
      actorUserId: userId,
    }, { organizationId: orgId, idempotencyKey: `avscan:${fileBlobId}` });

    if (kind === 'IMAGE') {
      await this.jobsService.enqueue('IMAGE_DERIVATIVES', {
        organizationId: orgId,
        fileBlobId,
        presets: ['thumb', 'card', 'full'],
        actorUserId: userId,
      }, { organizationId: orgId, idempotencyKey: `deriv:${fileBlobId}:v1` });
    }
  }

  async newVersion(orgId: string, userId: string, documentId: string, dto: {
    uploadSessionId: string;
    sha256: string;
    etag?: string;
  }) {
    // Phase 1: validate doc + session outside main transaction
    const doc = await withOrg(this.prisma, orgId, async (tx) => {
      return tx.document.findUnique({ where: { id: documentId } });
    });
    if (!doc || doc.status !== 'ACTIVE') {
      throw new AppError('NOT_FOUND', 404, 'Document not found');
    }

    const session = await withOrg(this.prisma, orgId, async (tx) => {
      return tx.uploadSession.findUnique({ where: { id: dto.uploadSessionId } });
    });
    if (!session) {
      throw new AppError('NOT_FOUND', 404, 'Upload session not found');
    }
    if (session.expiresAt < new Date()) {
      await this.prisma.uploadSession.update({ where: { id: session.id }, data: { status: 'EXPIRED' } });
      throw new AppError('UPLOAD_EXPIRED', 410, 'Upload session expired');
    }
    if (session.status === 'CONFIRMED') {
      throw new AppError('UPLOAD_ALREADY_CONFIRMED', 409, 'Upload already confirmed');
    }

    const head = await this.s3.headObject(session.storageKey);
    if (!head) {
      throw new AppError('UPLOAD_NOT_FOUND_IN_STORAGE', 400, 'File not found in storage');
    }
    if (head.size !== session.sizeBytes) {
      throw new AppError('UPLOAD_SIZE_MISMATCH', 400, `Expected ${session.sizeBytes} bytes, got ${head.size}`);
    }

    const headerBytes = await this.s3.getObjectRange(session.storageKey, 0, 15);
    if (!verifyMagicBytes(headerBytes, session.mimeType)) {
      await this.prisma.uploadSession.update({ where: { id: session.id }, data: { status: 'ABORTED' } });
      throw new AppError('FILE_SIGNATURE_MISMATCH', 400, 'File signature does not match declared MIME type');
    }

    // Phase 2: create blob + version in transaction
    const nvResult = await withOrg(this.prisma, orgId, async (tx) => {
      let blob = await tx.fileBlob.findFirst({
        where: { organizationId: orgId, sha256: dto.sha256 },
      });

      if (!blob) {
        const blobKey = `org/${orgId}/blobs/${dto.sha256}`;
        await this.s3.copyObject(session.storageKey, blobKey);
        blob = await tx.fileBlob.create({
          data: {
            organizationId: orgId,
            sha256: dto.sha256,
            sizeBytes: session.sizeBytes,
            mimeType: session.mimeType,
            bucket: session.bucket,
            storageKey: blobKey,
            etag: head.etag ?? dto.etag,
            status: IS_DEV ? 'SAFE' : 'QUARANTINED',
          },
        });
      }

      const lastVersion = await tx.documentVersion.findFirst({
        where: { documentId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (lastVersion?.version ?? 0) + 1;

      await tx.documentVersion.updateMany({
        where: { documentId, isCurrent: true },
        data: { isCurrent: false },
      });

      const version = await tx.documentVersion.create({
        data: {
          organizationId: orgId,
          documentId,
          fileBlobId: blob.id,
          version: nextVersion,
          isCurrent: true,
          originalFilename: session.originalFilename,
          createdByUserId: userId,
        },
      });

      await tx.uploadSession.update({
        where: { id: session.id },
        data: { status: 'CONFIRMED', sha256: dto.sha256, etag: head.etag ?? dto.etag, documentId },
      });

      return { versionId: version.id, version: nextVersion, fileBlobId: blob.id };
    });

    // Enqueue jobs after new version (outside transaction)
    this.enqueuePostConfirmJobs(orgId, nvResult.fileBlobId, doc.kind, userId).catch(() => {});

    return { versionId: nvResult.versionId, version: nvResult.version };
  }

  async getDocument(orgId: string, documentId: string) {
    return withOrg(this.prisma, orgId, async (tx) => {
      const doc = await tx.document.findUnique({
        where: { id: documentId },
        include: {
          versions: {
            where: { isCurrent: true },
            include: { blob: true },
          },
          links: true,
        },
      });
      if (!doc || doc.status === 'DELETED') {
        throw new AppError('NOT_FOUND', 404, 'Document not found');
      }
      return doc;
    });
  }

  async download(orgId: string, documentId: string) {
    return withOrg(this.prisma, orgId, async (tx) => {
      const doc = await tx.document.findUnique({
        where: { id: documentId },
        include: {
          versions: {
            where: { isCurrent: true },
            include: { blob: true },
          },
        },
      });
      if (!doc || doc.status !== 'ACTIVE') {
        throw new AppError('NOT_FOUND', 404, 'Document not found');
      }

      const currentVersion = doc.versions[0];
      if (!currentVersion) {
        throw new AppError('NOT_FOUND', 404, 'No current version');
      }

      if (currentVersion.blob.status !== 'SAFE') {
        throw new AppError('DOCUMENT_NOT_SAFE', 403, 'Document is not safe for download');
      }

      const url = await this.s3.presignGet(currentVersion.blob.storageKey, DOWNLOAD_TTL_SEC);
      return { url, expiresInSeconds: DOWNLOAD_TTL_SEC };
    });
  }

  async softDelete(orgId: string, userId: string, documentId: string, userRole: string) {
    return withOrg(this.prisma, orgId, async (tx) => {
      const doc = await tx.document.findUnique({ where: { id: documentId } });
      if (!doc || doc.status === 'DELETED') {
        throw new AppError('NOT_FOUND', 404, 'Document not found');
      }

      if (userRole === 'VIEWER') {
        throw new AppError('ROLE_FORBIDDEN', 403, 'Insufficient permissions');
      }
      if (userRole === 'AGENT' && doc.createdByUserId !== userId) {
        throw new AppError('ROLE_FORBIDDEN', 403, 'Can only delete own documents');
      }

      await tx.document.update({
        where: { id: documentId },
        data: { status: 'DELETED' },
      });

      return { ok: true };
    });
  }

  private validateKindMime(kind: string, mimeType: string) {
    if (kind === 'IMAGE' && !mimeType.startsWith('image/')) {
      throw new AppError('VALIDATION_ERROR', 400, 'DocumentKind IMAGE requires image/* MIME type');
    }
    if (kind === 'PDF' && mimeType !== 'application/pdf') {
      throw new AppError('VALIDATION_ERROR', 400, 'DocumentKind PDF requires application/pdf MIME type');
    }
  }
}

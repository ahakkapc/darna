import { PrismaClient } from '@prisma/client';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { withOrg } from './tenancy';

export async function processStorageGc(
  prisma: PrismaClient,
  s3: S3Client,
  bucket: string,
  payload: { organizationId: string; mode: 'LIGHT' | 'FULL'; requestId?: string },
): Promise<{ expiredSessions: number }> {
  const { organizationId, mode } = payload;
  let expiredSessions = 0;

  // LIGHT: expire pending/uploaded sessions past expiresAt
  const expiredRows = await withOrg(prisma, organizationId, async (tx) => {
    return tx.uploadSession.findMany({
      where: {
        status: { in: ['PENDING', 'UPLOADED'] },
        expiresAt: { lt: new Date() },
      },
    });
  });

  for (const session of expiredRows) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: session.storageKey }));
    } catch {
      // S3 delete is best-effort
    }

    await withOrg(prisma, organizationId, async (tx) => {
      await tx.uploadSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
    });

    expiredSessions++;
  }

  if (mode === 'FULL') {
    // FULL: purge documents DELETED older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await withOrg(prisma, organizationId, async (tx) => {
      const deletedDocs = await tx.document.findMany({
        where: { status: 'DELETED', updatedAt: { lt: cutoff } },
        select: { id: true },
      });

      for (const doc of deletedDocs) {
        await tx.documentLink.deleteMany({ where: { documentId: doc.id } });
        await tx.documentVersion.deleteMany({ where: { documentId: doc.id } });
        await tx.document.delete({ where: { id: doc.id } });
      }
    });
  }

  return { expiredSessions };
}

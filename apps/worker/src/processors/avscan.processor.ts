import { PrismaClient } from '@prisma/client';
import { withOrg } from './tenancy';

export async function processAvScan(
  prisma: PrismaClient,
  payload: { organizationId: string; fileBlobId: string; requestId?: string },
): Promise<void> {
  const { organizationId, fileBlobId } = payload;

  await withOrg(prisma, organizationId, async (tx) => {
    const blob = await tx.fileBlob.findUnique({ where: { id: fileBlobId } });
    if (!blob) {
      throw new Error(`FileBlob ${fileBlobId} not found`);
    }

    if (blob.status === 'SAFE' || blob.status === 'REJECTED') {
      return;
    }

    // MVP: stub — always SAFE in dev
    // In production, integrate ClamAV daemon here
    const isSafe = true;

    await tx.fileBlob.update({
      where: { id: fileBlobId },
      data: { status: isSafe ? 'SAFE' : 'REJECTED' },
    });
  });
}

import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { withOrg } from './tenancy';

const PRESETS: Record<string, number> = {
  thumb: 200,
  card: 800,
  full: 1600,
};

export async function processDerivatives(
  prisma: PrismaClient,
  s3: S3Client,
  bucket: string,
  payload: { organizationId: string; fileBlobId: string; presets?: string[]; requestId?: string },
): Promise<void> {
  const { organizationId, fileBlobId } = payload;
  const presetNames = payload.presets ?? Object.keys(PRESETS);

  const blob = await withOrg(prisma, organizationId, async (tx) => {
    return tx.fileBlob.findUnique({ where: { id: fileBlobId } });
  });

  if (!blob) throw new Error(`FileBlob ${fileBlobId} not found`);
  if (!blob.mimeType.startsWith('image/')) return;

  const getRes = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: blob.storageKey }));
  const bodyStream = getRes.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of bodyStream) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  const originalBuffer = Buffer.concat(chunks);

  let sharp: any;
  try {
    sharp = require('sharp');
  } catch {
    console.warn('sharp not available — skipping derivatives');
    return;
  }

  const derivativeKeys: Record<string, string> = {};

  for (const preset of presetNames) {
    const width = PRESETS[preset];
    if (!width) continue;

    const resizedBuffer = await sharp(originalBuffer)
      .resize(width, undefined, { withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const derivKey = `org/${organizationId}/derivatives/${blob.sha256}/${preset}.jpg`;

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: derivKey,
      Body: resizedBuffer,
      ContentType: 'image/jpeg',
    }));

    derivativeKeys[`${preset}Key`] = derivKey;
  }

  await withOrg(prisma, organizationId, async (tx) => {
    const currentVersion = await tx.documentVersion.findFirst({
      where: { fileBlobId, isCurrent: true },
    });
    if (currentVersion) {
      const existingMeta = (currentVersion.metadataJson as Record<string, unknown>) ?? {};
      await tx.documentVersion.update({
        where: { id: currentVersion.id },
        data: { metadataJson: { ...existingMeta, derivatives: derivativeKeys } as any },
      });
    }
  });
}

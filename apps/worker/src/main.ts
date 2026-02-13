import { PrismaClient } from '@prisma/client';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import { processAvScan } from './processors/avscan.processor';
import { processDerivatives } from './processors/derivatives.processor';
import { processStorageGc } from './processors/storage-gc.processor';
import { processNotifyEmail } from './processors/notify-email.processor';

const BACKOFF_DELAYS = [30_000, 120_000, 600_000];

const prisma = new PrismaClient();

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const queueName = process.env.JOBS_QUEUE_NAME ?? 'darna-jobs';
const bucket = process.env.S3_BUCKET ?? 'darna-dev';
const heartbeatKey = 'worker:heartbeat';

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? 'darna',
    secretAccessKey: process.env.S3_SECRET_KEY ?? 'darna123',
  },
  forcePathStyle: true,
});

async function processJob(job: Job): Promise<void> {
  const jobRunId = job.data.jobRunId as string;
  if (!jobRunId) {
    console.error(`Job ${job.id} missing jobRunId`);
    return;
  }

  const jobRun = await prisma.jobRun.findUnique({ where: { id: jobRunId } });
  if (!jobRun) {
    console.error(`JobRun ${jobRunId} not found`);
    return;
  }

  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
  });

  try {
    switch (jobRun.type) {
      case 'AV_SCAN_DOCUMENT':
        await processAvScan(prisma, job.data);
        break;
      case 'IMAGE_DERIVATIVES':
        await processDerivatives(prisma, s3, bucket, job.data);
        break;
      case 'STORAGE_GC':
        await processStorageGc(prisma, s3, bucket, job.data);
        break;
      case 'NOTIFY_EMAIL':
        await processNotifyEmail(prisma, job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${jobRun.type}`);
    }

    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: { status: 'SUCCESS', finishedAt: new Date() },
    });

    console.log(`[OK] ${jobRun.type} jobRunId=${jobRunId}`);
  } catch (err) {
    const error = err as Error;
    const updatedRun = await prisma.jobRun.findUnique({ where: { id: jobRunId } });
    const attempts = updatedRun?.attempts ?? 1;
    const maxAttempts = updatedRun?.maxAttempts ?? 3;
    const isFinal = attempts >= maxAttempts;

    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: {
        status: isFinal ? 'FAILED' : 'RETRYING',
        finishedAt: isFinal ? new Date() : null,
        lastErrorCode: error.message?.substring(0, 100) ?? 'UNKNOWN',
        lastErrorJson: { message: error.message, stack: error.stack?.substring(0, 500) } as any,
      },
    });

    if (!isFinal) {
      const delay = BACKOFF_DELAYS[Math.min(attempts - 1, BACKOFF_DELAYS.length - 1)];
      console.log(`[RETRY] ${jobRun.type} jobRunId=${jobRunId} attempt=${attempts}/${maxAttempts} delay=${delay}ms`);
      throw error;
    }

    console.error(`[FAILED] ${jobRun.type} jobRunId=${jobRunId}: ${error.message}`);
  }
}

async function startHeartbeat() {
  setInterval(async () => {
    try {
      await connection.set(heartbeatKey, Date.now().toString(), 'EX', 60);
    } catch {
      // best effort
    }
  }, 30_000);
  await connection.set(heartbeatKey, Date.now().toString(), 'EX', 60);
}

async function main() {
  console.log(`Worker starting — queue=${queueName} redis=${redisUrl}`);

  await startHeartbeat();

  const worker = new Worker(queueName, processJob, {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_DEFAULT ?? '2', 10),
  });

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed: ${err.message}`);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down...');
    await worker.close();
    connection.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down...');
    await worker.close();
    connection.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });

  console.log('Worker ready');
}

main().catch((err) => {
  console.error('Worker fatal error:', err);
  process.exit(1);
});

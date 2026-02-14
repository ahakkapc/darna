import { PrismaClient } from '@prisma/client';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import { processAvScan } from './processors/avscan.processor';
import { processDerivatives } from './processors/derivatives.processor';
import { processStorageGc } from './processors/storage-gc.processor';
import { processNotifyEmail } from './processors/notify-email.processor';
import { processNotifyWhatsapp } from './processors/notify-whatsapp.processor';
import { processOrgTickTasks } from './processors/org-tick-tasks.processor';
import { processInboundEvent } from './processors/inbound-process-event.processor';
import { processOutboundJob } from './processors/outbound-process-job.processor';
import { processIntegrationHealthcheck } from './processors/integration-healthcheck.processor';
import { processMetaLeadgenBackfill } from './processors/meta-leadgen-backfill.processor';
import { processInboxSlaTick } from './processors/inbox-sla-tick.processor';
import { processCommBackfillThread } from './processors/comm-backfill-thread.processor';
import { processSequenceTick } from './processors/sequence-tick.processor';
import { logger } from './logger';

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
    logger.error('Job missing jobRunId', { jobId: job.id });
    return;
  }

  const jobRun = await prisma.jobRun.findUnique({ where: { id: jobRunId } });
  if (!jobRun) {
    logger.error('JobRun not found', { jobRunId });
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
      case 'NOTIFY_WHATSAPP':
        await processNotifyWhatsapp(prisma, job.data);
        break;
      case 'ORG_TICK_TASKS':
        await processOrgTickTasks(prisma, job.data);
        break;
      case 'INBOUND_PROCESS_EVENT':
        await processInboundEvent(prisma, job.data);
        break;
      case 'OUTBOUND_PROCESS_JOB':
        await processOutboundJob(prisma, job.data);
        break;
      case 'INTEGRATION_HEALTHCHECK':
        await processIntegrationHealthcheck(prisma, job.data);
        break;
      case 'META_LEADGEN_BACKFILL':
        await processMetaLeadgenBackfill(prisma, job.data);
        break;
      case 'INBOX_SLA_TICK':
        await processInboxSlaTick(prisma, job.data);
        break;
      case 'COMM_BACKFILL_THREAD':
        await processCommBackfillThread(prisma, job.data);
        break;
      case 'SEQUENCE_TICK':
        await processSequenceTick(prisma);
        break;
      default:
        throw new Error(`Unknown job type: ${jobRun.type}`);
    }

    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: { status: 'SUCCESS', finishedAt: new Date() },
    });

    logger.info('Job completed', { type: jobRun.type, jobRunId });
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
      logger.warn('Job retrying', { type: jobRun.type, jobRunId, attempt: attempts, maxAttempts, delayMs: delay });
      throw error;
    }

    logger.error('Job failed permanently', { type: jobRun.type, jobRunId, error: error.message });
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
  logger.info('Worker starting', { queue: queueName, redis: redisUrl });

  await startHeartbeat();

  const worker = new Worker(queueName, processJob, {
    connection: connection as any,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY_DEFAULT ?? '2', 10),
  });

  worker.on('completed', (job) => {
    logger.info('BullMQ job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('BullMQ job failed', { jobId: job?.id, error: err.message });
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');
    await worker.close();
    connection.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down...');
    await worker.close();
    connection.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  });

  logger.info('Worker ready');
}

main().catch((err) => {
  logger.error('Worker fatal error', { error: (err as Error).message });
  process.exit(1);
});

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('AV_SCAN_DOCUMENT', 'IMAGE_DERIVATIVES', 'STORAGE_GC', 'NOTIFY_EMAIL');

-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "type" "JobType" NOT NULL,
    "organizationId" UUID,
    "idempotencyKey" TEXT,
    "payloadJson" JSONB NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_locks" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "key" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_type_status_scheduledAt_idx" ON "job_runs"("type", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "job_runs_organizationId_status_idx" ON "job_runs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "job_locks_expiresAt_idx" ON "job_locks"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_locks_organizationId_key_key" ON "job_locks"("organizationId", "key");

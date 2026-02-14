/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,channel,dedupeKey]` on the table `notification_dispatches` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationDispatchState" ADD VALUE 'SENDING';
ALTER TYPE "NotificationDispatchState" ADD VALUE 'DEAD';

-- AlterTable
ALTER TABLE "notification_dispatches" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "lastErrorMessage" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedBy" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "payloadJson" JSONB,
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "templateKey" TEXT,
ADD COLUMN     "to" TEXT,
ALTER COLUMN "maxAttempts" SET DEFAULT 8;

-- AlterTable
ALTER TABLE "task_reminders" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notification_dispatches_state_nextAttemptAt_idx" ON "notification_dispatches"("state", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_dispatches_organizationId_channel_dedupeKey_key" ON "notification_dispatches"("organizationId", "channel", "dedupeKey");

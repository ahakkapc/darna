-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'CALL', 'SMS', 'EMAIL', 'VISIT', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "ActivityDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('ANSWERED', 'NO_ANSWER', 'BUSY', 'VOICEMAIL', 'WRONG_NUMBER');

-- CreateEnum
CREATE TYPE "ActivityVisibility" AS ENUM ('INTERNAL', 'MANAGER_ONLY');

-- CreateEnum
CREATE TYPE "SystemEventKind" AS ENUM ('LEAD_CREATED', 'STATUS_CHANGED', 'OWNER_ASSIGNED', 'MARKED_LOST', 'MARKED_WON');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "status" "LeadStatus" NOT NULL DEFAULT 'NEW';

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "visibility" "ActivityVisibility" NOT NULL DEFAULT 'INTERNAL',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "happenedAt" TIMESTAMP(3),
    "plannedAt" TIMESTAMP(3),
    "direction" "ActivityDirection",
    "title" TEXT,
    "body" TEXT,
    "payloadJson" JSONB,
    "relatedDocumentId" UUID,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" UUID,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_activities_organizationId_idx" ON "lead_activities"("organizationId");

-- CreateIndex
CREATE INDEX "lead_activities_leadId_createdAt_idx" ON "lead_activities"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "lead_activities_organizationId_type_idx" ON "lead_activities"("organizationId", "type");

-- CreateIndex
CREATE INDEX "lead_activities_organizationId_recordStatus_idx" ON "lead_activities"("organizationId", "recordStatus");

-- CreateIndex
CREATE INDEX "leads_orgId_status_idx" ON "leads"("orgId", "status");

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

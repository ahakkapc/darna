-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('ORG_PROFILE', 'COLLABORATORS', 'PLAN', 'PAYMENT_OFFLINE', 'KYC', 'FIRST_LISTING', 'DONE');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "orgs" ADD COLUMN     "wilaya" TEXT;

-- CreateTable
CREATE TABLE "org_onboardings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "currentStep" "OnboardingStep" NOT NULL DEFAULT 'ORG_PROFILE',
    "completedStepsJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_onboardings_orgId_key" ON "org_onboardings"("orgId");

-- CreateIndex
CREATE INDEX "org_onboardings_status_idx" ON "org_onboardings"("status");

-- CreateIndex
CREATE INDEX "org_onboardings_orgId_idx" ON "org_onboardings"("orgId");

-- AddForeignKey
ALTER TABLE "org_onboardings" ADD CONSTRAINT "org_onboardings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

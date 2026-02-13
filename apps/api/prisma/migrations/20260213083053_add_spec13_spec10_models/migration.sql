-- CreateEnum
CREATE TYPE "ProPersona" AS ENUM ('AGENCY', 'INDEPENDENT_AGENT', 'DEVELOPER');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTED', 'NEEDS_CHANGES', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlanCode" AS ENUM ('AGENCY_DISCOVERY', 'AGENCY_PRO', 'AGENCY_PREMIUM', 'INDE_SOLO', 'DEV_STANDARD', 'DEV_PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'PENDING_PAYMENT', 'ACTIVE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('APARTMENT', 'HOUSE', 'VILLA', 'LAND', 'COMMERCIAL', 'OFFICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingDealType" AS ENUM ('SALE', 'RENT', 'SEASONAL');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'SOLD', 'RENTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ListingVisibility" AS ENUM ('PLATFORM', 'PRIVATE_INTERNAL');

-- CreateEnum
CREATE TYPE "PhotoQualityStatus" AS ENUM ('REJECTED', 'NEEDS_IMPROVEMENT', 'OK');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'DELETED');

-- AlterTable
ALTER TABLE "orgs" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "isVerifiedPro" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kycNotes" TEXT,
ADD COLUMN     "kycRejectionReason" TEXT,
ADD COLUMN     "kycReviewedByUserId" TEXT,
ADD COLUMN     "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "kycSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "kycVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "persona" "ProPersona",
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "registryCity" TEXT,
ADD COLUMN     "registryNumber" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "platformRole" TEXT;

-- CreateTable
CREATE TABLE "kyc_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'SUBMITTED',
    "registryNumber" TEXT NOT NULL,
    "registryCity" TEXT,
    "legalName" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "decisionReason" TEXT,
    "notes" TEXT,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "kyc_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planCode" "PlanCode" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offline_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountDa" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DZD',
    "method" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "rejectionReason" TEXT,
    "notes" TEXT,

    CONSTRAINT "offline_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "dealType" "ListingDealType" NOT NULL,
    "type" "ListingType" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "ListingVisibility" NOT NULL DEFAULT 'PLATFORM',
    "wilaya" TEXT NOT NULL,
    "commune" TEXT,
    "quartier" TEXT,
    "addressLine" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priceDa" INTEGER NOT NULL,
    "surfaceM2" INTEGER,
    "rooms" INTEGER,
    "floor" INTEGER,
    "hasElevator" BOOLEAN,
    "hasParking" BOOLEAN,
    "hasBalcony" BOOLEAN,
    "furnished" BOOLEAN,
    "photoQualityScore" INTEGER,
    "photoQualityStatus" "PhotoQualityStatus",
    "photoQualityFeedbackJson" JSONB,
    "publishedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "leadCount" INTEGER NOT NULL DEFAULT 0,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_moderations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "autoChecksJson" JSONB,
    "decisionReason" TEXT,
    "notes" TEXT,

    CONSTRAINT "listing_moderations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_lead_relations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_lead_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kyc_requests_organizationId_submittedAt_idx" ON "kyc_requests"("organizationId", "submittedAt");

-- CreateIndex
CREATE INDEX "kyc_requests_status_submittedAt_idx" ON "kyc_requests"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_createdAt_idx" ON "subscriptions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_status_idx" ON "subscriptions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "offline_payments_organizationId_submittedAt_idx" ON "offline_payments"("organizationId", "submittedAt");

-- CreateIndex
CREATE INDEX "offline_payments_status_submittedAt_idx" ON "offline_payments"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "listings_organizationId_idx" ON "listings"("organizationId");

-- CreateIndex
CREATE INDEX "listings_organizationId_ownerUserId_idx" ON "listings"("organizationId", "ownerUserId");

-- CreateIndex
CREATE INDEX "listings_organizationId_status_idx" ON "listings"("organizationId", "status");

-- CreateIndex
CREATE INDEX "listings_organizationId_wilaya_idx" ON "listings"("organizationId", "wilaya");

-- CreateIndex
CREATE INDEX "listings_organizationId_dealType_idx" ON "listings"("organizationId", "dealType");

-- CreateIndex
CREATE INDEX "listings_organizationId_updatedAt_idx" ON "listings"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "listings_organizationId_recordStatus_idx" ON "listings"("organizationId", "recordStatus");

-- CreateIndex
CREATE UNIQUE INDEX "listing_moderations_listingId_key" ON "listing_moderations"("listingId");

-- CreateIndex
CREATE INDEX "listing_moderations_status_submittedAt_idx" ON "listing_moderations"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "listing_moderations_organizationId_idx" ON "listing_moderations"("organizationId");

-- CreateIndex
CREATE INDEX "listing_lead_relations_organizationId_idx" ON "listing_lead_relations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_lead_relations_listingId_leadId_key" ON "listing_lead_relations"("listingId", "leadId");

-- AddForeignKey
ALTER TABLE "kyc_requests" ADD CONSTRAINT "kyc_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_payments" ADD CONSTRAINT "offline_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "orgs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_moderations" ADD CONSTRAINT "listing_moderations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_lead_relations" ADD CONSTRAINT "listing_lead_relations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_lead_relations" ADD CONSTRAINT "listing_lead_relations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('IMAGE', 'PDF', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'CONFIRMED', 'ABORTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "FileBlobStatus" AS ENUM ('QUARANTINED', 'SAFE', 'REJECTED');

-- CreateEnum
CREATE TYPE "LinkTargetType" AS ENUM ('LISTING', 'PROGRAM', 'LEAD', 'KYC', 'USER_PROFILE', 'OTHER');

-- CreateTable
CREATE TABLE "file_blobs" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "etag" TEXT,
    "status" "FileBlobStatus" NOT NULL DEFAULT 'QUARANTINED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_blobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "title" TEXT,
    "visibility" "DocumentVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "fileBlobId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "originalFilename" TEXT,
    "metadataJson" JSONB,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_links" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "targetType" "LinkTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "tag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdByUserId" UUID,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "etag" TEXT,
    "originalFilename" TEXT,
    "documentId" UUID,

    CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "file_blobs_storageKey_key" ON "file_blobs"("storageKey");

-- CreateIndex
CREATE INDEX "file_blobs_organizationId_idx" ON "file_blobs"("organizationId");

-- CreateIndex
CREATE INDEX "file_blobs_organizationId_status_idx" ON "file_blobs"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "file_blobs_organizationId_sha256_key" ON "file_blobs"("organizationId", "sha256");

-- CreateIndex
CREATE INDEX "documents_organizationId_idx" ON "documents"("organizationId");

-- CreateIndex
CREATE INDEX "documents_organizationId_status_idx" ON "documents"("organizationId", "status");

-- CreateIndex
CREATE INDEX "document_versions_organizationId_idx" ON "document_versions"("organizationId");

-- CreateIndex
CREATE INDEX "document_versions_documentId_isCurrent_idx" ON "document_versions"("documentId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_version_key" ON "document_versions"("documentId", "version");

-- CreateIndex
CREATE INDEX "document_links_organizationId_idx" ON "document_links"("organizationId");

-- CreateIndex
CREATE INDEX "document_links_targetType_targetId_idx" ON "document_links"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "document_links_documentId_targetType_targetId_tag_key" ON "document_links"("documentId", "targetType", "targetId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "upload_sessions_storageKey_key" ON "upload_sessions"("storageKey");

-- CreateIndex
CREATE INDEX "upload_sessions_organizationId_idx" ON "upload_sessions"("organizationId");

-- CreateIndex
CREATE INDEX "upload_sessions_organizationId_status_idx" ON "upload_sessions"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_fileBlobId_fkey" FOREIGN KEY ("fileBlobId") REFERENCES "file_blobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_links" ADD CONSTRAINT "document_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

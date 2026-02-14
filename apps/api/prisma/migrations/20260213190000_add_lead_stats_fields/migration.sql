-- Add stats fields to leads for dashboard
ALTER TABLE "leads" ADD COLUMN "statusChangedAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "wonAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN "lostAt" TIMESTAMP(3);

-- Index for dashboard queries on wonAt/lostAt
CREATE INDEX "leads_organizationId_wonAt_idx" ON "leads"("organizationId", "wonAt");
CREATE INDEX "leads_organizationId_lostAt_idx" ON "leads"("organizationId", "lostAt");
CREATE INDEX "leads_organizationId_createdAt_idx" ON "leads"("organizationId", "createdAt");

# RUNBOOK — Disaster Recovery & Operations

## 1. Database Backup

### Daily backup (cron)

```bash
# Run daily at 02:00 UTC — adjust schedule to your needs
pg_dump -h localhost -p 5433 -U darna -d darna -F c -Z 6 \
  -f /backups/darna-$(date +%Y%m%d-%H%M%S).dump
```

### Retention

- Keep **14 days** of daily backups.
- Purge older backups automatically:

```bash
find /backups -name "darna-*.dump" -mtime +14 -delete
```

### Encrypted backup (recommended prod)

```bash
pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -F c -Z 6 \
  | gpg --symmetric --cipher-algo AES256 -o /backups/darna-$(date +%Y%m%d).dump.gpg
```

## 2. Restore Procedure

### Standard restore

```bash
# 1. Stop the API
pm2 stop darna-api   # or systemctl stop darna-api

# 2. Drop and recreate the database
psql -h $DB_HOST -p $DB_PORT -U postgres -c "DROP DATABASE darna;"
psql -h $DB_HOST -p $DB_PORT -U postgres -c "CREATE DATABASE darna OWNER darna;"

# 3. Restore
pg_restore -h $DB_HOST -p $DB_PORT -U darna -d darna /backups/darna-YYYYMMDD.dump

# 4. Re-apply Prisma migrations (idempotent)
cd apps/api && npx prisma migrate deploy

# 5. Restart
pm2 start darna-api
```

### Encrypted restore

```bash
gpg --decrypt /backups/darna-YYYYMMDD.dump.gpg | pg_restore -h $DB_HOST -p $DB_PORT -U darna -d darna
```

## 3. Monthly Restore Test

- Schedule: **1st Monday of each month**
- Procedure:
  1. Restore latest backup to a **test database** (not prod).
  2. Run `npx prisma migrate deploy` on test DB.
  3. Run smoke tests: `npm --workspace apps/api run test:e2e` against test DB.
  4. Verify row counts on critical tables (`users`, `orgs`, `listings`, `audit_logs`).
  5. Document result in ops log.

## 4. Storage Lifecycle

- **Quarantined documents** (if SPEC-04 storage is active): purge after **30 days** if still `QUARANTINED` or `REJECTED`.
- **Failed upload artifacts**: purge after **7 days**.

```bash
# Example cleanup query (run via Prisma script, not raw SQL in prod code)
# Delete quarantined documents older than 30 days from object storage
```

## 5. Health Checks

### API health

```bash
curl -s http://localhost:3011/api/health | jq .
# Expected: { "ok": true, "db": "up", "ts": "..." }
```

### Database connectivity

```bash
psql -h $DB_HOST -p $DB_PORT -U darna -d darna -c "SELECT 1;"
```

## 6. Smoke Tests (post-deploy)

After every deployment:

```bash
npm --workspace apps/api run test:e2e
```

Minimum checks:
- Auth flow (register → login → refresh → logout)
- Tenant isolation (cross-org access denied)
- Rate limiting active (429 on brute-force)
- Security headers present

## 7. Alert Rules (monitoring)

| Condition                         | Severity | Action                      |
|-----------------------------------|----------|-----------------------------|
| 5xx rate > 2% over 10 min        | Critical | Page on-call                |
| DB health check fails             | Critical | Page on-call                |
| Queue retries spike (>10/min)     | Warning  | Investigate                 |
| OTP failed attempts spike         | Warning  | Check for brute-force       |
| Disk usage > 85%                  | Warning  | Expand / purge old backups  |

## 8. Secrets Management

- **Never** commit secrets to git.
- Use `.env` files (gitignored) or a secret manager (Vault, AWS SSM).
- Required env vars:
  - `DATABASE_URL`
  - `JWT_SECRET` (change from default in prod!)
  - `CORS_ORIGINS` (comma-separated allowed origins)
  - `NODE_ENV=production`

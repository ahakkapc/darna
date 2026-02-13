# Darna — Monorepo

## Structure

```
apps/
  api/    → NestJS (TypeScript) — port 3011
  web/    → Next.js (TypeScript) — port 3010
docker/
  docker-compose.yml → PostgreSQL 16 (port 5433)
```

## Lancer

```bash
npm install
npm run docker:up
npm run prisma:generate
npm run dev:api
npm run dev:web
```

## Tester

- **API** : http://localhost:3011/api/health → `{ ok: true, db: true }`
- **Web** : http://localhost:3010 → affiche "API OK"

## Multi-tenant Rules

- **RLS** (Row-Level Security) is enforced at the DB level on all tenant-scoped tables.
- Every tenant-scoped request must include header `x-org-id` (UUID).
- All tenant queries go through `withOrg(prisma, orgId, fn)` — never call Prisma directly.
- Anti-IDOR: if a resource belongs to another org → **404** (not 403).
- `darna_app` role (non-superuser) is used inside transactions so RLS cannot be bypassed.

### How to write a tenant-scoped endpoint

1. Add `@UseGuards(OrgContextGuard)` on the controller or route
2. Use `@OrgId()` param decorator to get the org ID
3. In the service, always use `withOrg(this.prisma, orgId, tx => tx.model...)`
4. On `/:id` routes: if `findUnique` returns null → throw 404

### How to add a new tenant-scoped table

1. Add `orgId` + `@relation` to `Org` + `@@index([orgId])` in Prisma schema
2. Create a migration: `npx prisma migrate dev --name add_<table>`
3. Create an RLS migration with: `ENABLE RLS`, `FORCE RLS`, 4 policies (SELECT/INSERT/UPDATE/DELETE)
4. Grant permissions: `GRANT SELECT, INSERT, UPDATE, DELETE ON "<table>" TO darna_app`
5. Add A/B tenant isolation tests

## Tests

```bash
npm --workspace apps/api run test:e2e
```

## Troubleshooting

- **Port occupé** : `netstat -aon | findstr :3011`
- **Docker pipe** : ouvrir Docker Desktop
- **Prisma** : `npm run prisma:generate` après modification du schema

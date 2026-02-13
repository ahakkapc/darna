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

## Troubleshooting

- **Port occupé** : `netstat -aon | findstr :3011`
- **Docker pipe** : ouvrir Docker Desktop
- **Prisma** : `npm run prisma:generate` après modification du schema

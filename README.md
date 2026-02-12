# Darna — Monorepo

## Structure

```
apps/
  api/    → NestJS (TypeScript) — port 3011
  web/    → Next.js (TypeScript) — port 3010
packages/
  shared/ → Shared types & utilities
docker/
  docker-compose.yml → PostgreSQL 16 (port 5433)
```

## Prerequisites

- Node.js ≥ 18
- Docker & Docker Compose

## Quick Start

### 1. Start the database

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 2. Setup environment

```bash
# Linux / macOS
cp apps/api/.env.example apps/api/.env

# Windows (PowerShell)
Copy-Item apps/api/.env.example apps/api/.env
```

### 3. Install dependencies

```bash
npm install
```

### 4. Generate Prisma client & push schema

```bash
npm run prisma:generate --workspace=apps/api
npm run prisma:push --workspace=apps/api
```

### 5. Start the API

```bash
npm run dev:api
```

### 6. Start the Web app

```bash
npm run dev:web
```

### Or start everything at once

```bash
npm run dev
```

## Health Check (DoD)

- **API**: `GET http://localhost:3011/api/health` → `{ ok: true, db: true }`
- **Web**: `http://localhost:3010` → displays "API OK" with DB status

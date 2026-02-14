# Darna — Notes d'audit

## Prérequis

- **Node.js** ≥ 18
- **Docker** + Docker Compose
- **npm** (workspaces natifs)

## Démarrage rapide

```bash
# 1. Copier les variables d'environnement
cp .env.example .env

# 2. Lancer la base de données (PostgreSQL 16)
npm run docker:up

# 3. Installer les dépendances
npm install

# 4. Générer le client Prisma + appliquer les migrations
npm run prisma:generate
npm run prisma:migrate

# 5. Lancer l'API + le front
npm run dev
```

## Ports

| Service       | Port  | URL                          |
|---------------|-------|------------------------------|
| PostgreSQL    | 5433  | `localhost:5433`             |
| NestJS API    | 3011  | `http://localhost:3011/api`  |
| Next.js Web   | 3010  | `http://localhost:3010`      |
| MinIO API     | 9000  | `http://localhost:9000`      |
| MinIO Console | 9002  | `http://localhost:9002`      |

## Scripts utiles

```bash
npm run dev:api          # API seule
npm run dev:web          # Front seul
npm run dev:worker       # Worker (jobs asynchrones)
npm run docker:up        # Démarrer Docker (DB + MinIO)
npm run docker:down      # Arrêter Docker
npm run prisma:generate  # Regénérer le client Prisma
npm run prisma:migrate   # Appliquer les migrations
```

## Tests E2E (API)

```bash
npm --workspace apps/api run test:e2e
```

## Comptes de test (dev uniquement)

Pas de seed automatique. Pour créer un compte :

```bash
# POST /api/auth/register
curl -X POST http://localhost:3011/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"audit@test.com","password":"Test1234!","name":"Auditeur"}'
```

## Identifiants Docker (dev)

| Service    | User    | Password   |
|------------|---------|------------|
| PostgreSQL | darna   | darna      |
| MinIO      | darna   | darna123   |

## Architecture

```
repo/
├── apps/
│   ├── api/         # NestJS — backend REST + Prisma ORM
│   ├── web/         # Next.js 14 App Router — frontend
│   └── worker/      # Worker BullMQ — jobs asynchrones
├── packages/
│   └── shared/      # Types/utilitaires partagés
├── docker/          # docker-compose.yml (PG + MinIO)
└── package.json     # Monorepo npm workspaces
```

## Points clés

- **Multi-tenant** : RLS PostgreSQL, `withOrg()` wrapper, `x-org-id` header
- **Auth** : JWT (httpOnly cookie) + refresh token rotation
- **Storage** : S3/MinIO, presign → upload → confirm (2-phase)
- **Prisma-only** : aucun raw SQL pour les requêtes métier
- **Anti-IDOR** : ressource hors org → 404 (jamais 403)

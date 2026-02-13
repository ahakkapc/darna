import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('SPEC-02 — Auth + Org + RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const userA = { email: 'alice@test.com', password: 'password1234', name: 'Alice' };
  const userB = { email: 'bob@test.com', password: 'password5678', name: 'Bob' };
  const userC = { email: 'carol@test.com', password: 'password9012', name: 'Carol' };

  let cookiesA: string[];
  let cookiesB: string[];
  let cookiesC: string[];
  let orgId: string;
  let inviteTokenAgent: string;
  let inviteTokenViewer: string;
  let userAId: string;
  let userBId: string;
  let userCId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Clean slate
    await prisma.orgInvite.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.orgMembership.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.org.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.orgInvite.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.orgMembership.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.org.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  // ─── Auth ────────────────────────────────────────────────────────
  describe('Auth', () => {
    it('POST /api/auth/register → 201 (user A)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(userA)
        .expect(201);

      expect(res.body.email).toBe(userA.email);
      expect(res.body.name).toBe(userA.name);
      expect(res.body).not.toHaveProperty('passwordHash');
      userAId = res.body.id;
    });

    it('POST /api/auth/register → 201 (user B)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(userB)
        .expect(201);
      userBId = res.body.id;
    });

    it('POST /api/auth/register → 201 (user C)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(userC)
        .expect(201);
      userCId = res.body.id;
    });

    it('POST /api/auth/register duplicate → 409 EMAIL_ALREADY_USED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send(userA)
        .expect(409);

      expect(res.body.error.code).toBe('EMAIL_ALREADY_USED');
    });

    it('POST /api/auth/login → 200 + cookies set', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userA.email, password: userA.password })
        .expect(200);

      expect(res.body.ok).toBe(true);
      cookiesA = res.headers['set-cookie'] as unknown as string[];
      expect(cookiesA.some((c: string) => c.includes('access_token'))).toBe(true);
      expect(cookiesA.some((c: string) => c.includes('refresh_token'))).toBe(true);
    });

    it('POST /api/auth/login invalid password → 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userA.email, password: 'wrongpassword' })
        .expect(401);

      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('GET /api/auth/me → 200 user info', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', cookiesA)
        .expect(200);

      expect(res.body.user.email).toBe(userA.email);
      expect(res.body.user.name).toBe(userA.name);
    });

    it('POST /api/auth/refresh → rotation ok, old refresh rejected', async () => {
      // Extract current refresh cookie
      const oldRefreshCookie = cookiesA.find((c: string) => c.includes('refresh_token'));
      expect(oldRefreshCookie).toBeDefined();

      // Refresh
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookiesA)
        .expect(200);

      expect(res.body.ok).toBe(true);
      const newCookies = res.headers['set-cookie'] as unknown as string[];
      expect(newCookies.some((c: string) => c.includes('access_token'))).toBe(true);

      // Try using old refresh cookie → must fail
      const res2 = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', cookiesA)
        .expect(401);

      expect(res2.body.error.code).toBe('REFRESH_INVALID');

      // Update cookies to new ones
      cookiesA = newCookies;
    });

    it('Login user B + C for later tests', async () => {
      const resB = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userB.email, password: userB.password })
        .expect(200);
      cookiesB = resB.headers['set-cookie'] as unknown as string[];

      const resC = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: userC.email, password: userC.password })
        .expect(200);
      cookiesC = resC.headers['set-cookie'] as unknown as string[];
    });
  });

  // ─── Org / Membership ───────────────────────────────────────────
  describe('Org & Membership', () => {
    it('POST /api/orgs → create org (user A becomes OWNER)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orgs')
        .set('Cookie', cookiesA)
        .send({ name: 'Agence Test' })
        .expect(201);

      expect(res.body.orgId).toBeDefined();
      expect(res.body.name).toBe('Agence Test');
      orgId = res.body.orgId;
    });

    it('GET /api/orgs → user A sees the org', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orgs')
        .set('Cookie', cookiesA)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].orgId).toBe(orgId);
      expect(res.body[0].role).toBe('OWNER');
    });

    it('GET /api/orgs → user B sees no orgs yet', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orgs')
        .set('Cookie', cookiesB)
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it('POST /api/orgs/:orgId/invite → OWNER invites user B as AGENT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/orgs/${orgId}/invite`)
        .set('Cookie', cookiesA)
        .send({ email: userB.email, role: 'AGENT' })
        .expect(201);

      expect(res.body.inviteId).toBeDefined();
      expect(res.body.token).toBeDefined();
      inviteTokenAgent = res.body.token;
    });

    it('POST /api/orgs/invites/accept → user B accepts invite', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orgs/invites/accept')
        .set('Cookie', cookiesB)
        .send({ token: inviteTokenAgent })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.orgId).toBe(orgId);
      expect(res.body.role).toBe('AGENT');
    });

    it('GET /api/orgs → user B now sees the org', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orgs')
        .set('Cookie', cookiesB)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].role).toBe('AGENT');
    });

    it('POST invite user C as VIEWER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/orgs/${orgId}/invite`)
        .set('Cookie', cookiesA)
        .send({ email: userC.email, role: 'VIEWER' })
        .expect(201);
      inviteTokenViewer = res.body.token;

      await request(app.getHttpServer())
        .post('/api/orgs/invites/accept')
        .set('Cookie', cookiesC)
        .send({ token: inviteTokenViewer })
        .expect(201);
    });

    it('GET /api/orgs/:orgId/members → OWNER can list members', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/orgs/${orgId}/members`)
        .set('Cookie', cookiesA)
        .expect(200);

      expect(res.body).toHaveLength(3);
      const roles = res.body.map((m: { role: string }) => m.role).sort();
      expect(roles).toEqual(['AGENT', 'OWNER', 'VIEWER']);
    });
  });

  // ─── RBAC ───────────────────────────────────────────────────────
  describe('RBAC', () => {
    it('AGENT (user B) cannot invite → 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/orgs/${orgId}/invite`)
        .set('Cookie', cookiesB)
        .send({ email: 'new@test.com', role: 'VIEWER' })
        .expect(403);

      expect(res.body.error.code).toBe('ORG_FORBIDDEN');
    });

    it('VIEWER (user C) cannot list members → 403', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/orgs/${orgId}/members`)
        .set('Cookie', cookiesC)
        .expect(403);

      expect(res.body.error.code).toBe('ORG_FORBIDDEN');
    });

    it('AGENT (user B) cannot change role → 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/orgs/${orgId}/members/${userCId}`)
        .set('Cookie', cookiesB)
        .send({ role: 'MANAGER' })
        .expect(403);

      expect(res.body.error.code).toBe('ORG_FORBIDDEN');
    });

    it('OWNER (user A) can promote user B to MANAGER → 200', async () => {
      await request(app.getHttpServer())
        .patch(`/api/orgs/${orgId}/members/${userBId}`)
        .set('Cookie', cookiesA)
        .send({ role: 'MANAGER' })
        .expect(200);
    });

    it('MANAGER (user B) can now list members → 200', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/orgs/${orgId}/members`)
        .set('Cookie', cookiesB)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(3);
    });

    it('MANAGER (user B) can now invite → 201', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/orgs/${orgId}/invite`)
        .set('Cookie', cookiesB)
        .send({ email: 'new-manager-invite@test.com', role: 'VIEWER' })
        .expect(201);

      expect(res.body.token).toBeDefined();
    });
  });

  // ─── Logout ─────────────────────────────────────────────────────
  describe('Logout', () => {
    it('POST /api/auth/logout → clears cookies', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookiesA)
        .expect(200);

      expect(res.body.ok).toBe(true);
    });
  });
});
